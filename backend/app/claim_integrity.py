"""Authenticated claim lifecycle, evidence validation and revision-bound staff actions."""
import hashlib
import json
import os
import re
from contextlib import closing
from datetime import date
from uuid import UUID, uuid4
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import audit, main, outcome_intelligence, payer_profiles, privacy
from .financial_reconciliation import (
    FAMILY, MOVEMENTS, OPTIONAL_MONEY, PREREQUISITES, REIMBURSEMENT_RULES, STAGES, calculate, simulate,
)

router = APIRouter(prefix="/api")
SCHEMA = outcome_intelligence.SCHEMA + payer_profiles.SCHEMA + """
create table if not exists integrity_events(
    id TEXT PRIMARY KEY, case_id TEXT NOT NULL, event_key TEXT NOT NULL,
    kind TEXT NOT NULL, effective_date TEXT NOT NULL, source_id TEXT NOT NULL,
    page INTEGER NOT NULL, payload TEXT NOT NULL, supersedes TEXT, related TEXT, transaction_key TEXT,
    case_revision TEXT NOT NULL, recorded_at TEXT NOT NULL, reviewer TEXT NOT NULL,
    unique(case_id, event_key), unique(case_id, source_id, page), unique(case_id, transaction_key)
);
create index if not exists integrity_case_timeline on integrity_events(case_id, effective_date, recorded_at);
create table if not exists integrity_reviews(
    case_id TEXT PRIMARY KEY, case_revision TEXT NOT NULL, reviewed_at TEXT NOT NULL, reviewer TEXT NOT NULL
);
create table if not exists integrity_demo_cases(
    case_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL UNIQUE
);
create table if not exists integrity_payment_investigations(
    event_id TEXT PRIMARY KEY, case_id TEXT NOT NULL, recorded_at TEXT NOT NULL,
    status TEXT NOT NULL, expected_paise INTEGER, received_paise INTEGER, evidence TEXT NOT NULL
);
create index if not exists integrity_investigations_case on integrity_payment_investigations(case_id, recorded_at);
"""

CATEGORY = "Financial claim evidence"


class RevisionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expectedRevision: str = Field(min_length=1, max_length=64)
    staffConfirmed: Literal[True]

    @field_validator("staffConfirmed", mode="before")
    @classmethod
    def confirm_explicitly(cls, value):
        if value is not True:
            raise ValueError("Explicit staff confirmation is required")
        return value


class EventIn(RevisionIn):
    eventKey: UUID
    kind: str = Field(max_length=60)
    documentId: UUID
    page: int = Field(ge=1, le=main.MAX_PAGES, strict=True)
    supersedes: UUID | None = None
    related: UUID | None = None


class DemoStepIn(RevisionIn):
    step: int = Field(ge=0, strict=True)


class OutcomeIn(RevisionIn):
    eventId: UUID
    category: str = Field(max_length=60)
    reason: str = Field(max_length=60)


class ProfileProposalIn(RevisionIn):
    parent: str = Field(max_length=60)
    effectiveDate: date
    expiryDate: date | None = None
    enhancementThresholdPaise: int = Field(strict=True, ge=0, le=10**12)


class ProfilePinIn(RevisionIn):
    version: str | None = Field(default=None, max_length=60)


class SimulationIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expectedRevision: str = Field(min_length=1, max_length=64)
    action: Literal["authorization", "estimate", "payment"]
    paise: int = Field(ge=0, le=10**12, strict=True)


def reject(message, status=422):
    raise HTTPException(status, message)


def page_text(doc, page):
    return dict(main.document_pages(doc["filename"], doc["text"])).get(page, "")


def parse_source(kind, text):
    if kind not in STAGES:
        reject("Choose a supported lifecycle event type.")
    # Exact, uniquely labelled lines make the evidence deterministic. Uploaded text is data.
    matches = {}
    blocked = False
    for line in text.splitlines():
        if main.INSTRUCTION_BLOCK.fullmatch(line):
            blocked = line.lstrip().upper().startswith("BEGIN")
            continue
        if blocked or ": " not in line:
            continue
        key, value = line.split(": ", 1)
        matches.setdefault(key, []).append((value.strip(), line.strip()))

    def entry(label, required=True):
        values = matches.get(label, [])
        if len(values) != 1:
            if values or required:
                reject(f"The source page must contain one {label} line.")
            return None
        return values[0]

    if entry("Record type")[0] != kind:
        reject("The source record type does not match the selected event.")
    try:
        raw_date, _ = entry("Effective date")
        effective = date.fromisoformat(raw_date)
        if effective.isoformat() != raw_date:
            raise ValueError
    except ValueError:
        reject("The evidence date must use YYYY-MM-DD.")

    amounts, evidence = {}, {}
    rules = STAGES[kind][1]
    for key, label in (rules | OPTIONAL_MONEY.get(kind, {})).items():
        item = entry(label, key in rules)
        if item is None:
            continue
        raw, quote = item
        money = re.fullmatch(r"INR ([0-9]{1,10})(?:\.([0-9]{2}))?", raw)
        if money is None:
            reject(f"{label} must use INR followed by digits and optional two decimal places.")
        amounts[key] = int(money[1]) * 100 + int(money[2] or "0")
        evidence[key] = quote
    rule = closure = transaction_key = None
    if kind == "agreement":
        if amounts["responsibility"] > amounts["allowable"]:
            reject("Verified patient responsibility cannot exceed the allowable amount for this rule.")
        declaration = entry("Reimbursement rule", False)
        if declaration and declaration[0] in REIMBURSEMENT_RULES:
            rule = declaration[0]
            evidence["rule"] = declaration[1]
        # Optional terms are recorded as evidence only. The supported formula requires the
        # documented responsibility and allowable amount to already reflect applicable terms.
    if kind == "settlement":
        closure, evidence["status"] = entry("Settlement status")
        if closure not in ("partial", "final"):
            reject("Settlement status must be partial or final.")
    if kind in MOVEMENTS:
        reference = entry("Transaction reference")[0]
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/-]{0,79}", reference):
            reject("The payment reference format is invalid.")
        transaction_key = hashlib.sha256(reference.casefold().encode()).hexdigest()
        if not amounts["payment"]:
            reject("A payment, refund or reversal needs a positive amount.")
    return {"date": effective.isoformat(), "amounts": amounts, "rule": rule, "closure": closure,
            "transaction": transaction_key}, evidence, entry("Effective date")[1]


def load_events(connection, cid):
    rows = connection.execute(
        """select e.*, d.filename, d.text from integrity_events e left join documents d
        on d.id=e.source_id and d.case_id=e.case_id
        where e.case_id=? order by e.effective_date, e.recorded_at, e.id""", (cid,),
    )
    events = []
    for row in rows:
        payload = json.loads(row["payload"])
        evidence = {}
        date_excerpt = None
        supported = False
        if row["filename"]:
            try:
                facts, evidence, date_excerpt = parse_source(row["kind"], page_text(row, row["page"]))
                supported = facts == payload
            except HTTPException:
                pass
        events.append({
            "id": row["id"], "kind": row["kind"], "label": STAGES[row["kind"]][0],
            "date": row["effective_date"], "recordedAt": row["recorded_at"], "reviewer": row["reviewer"],
            "revision": row["case_revision"], "currency": "INR", "supported": supported,
            "verification": "Verified" if supported else "Source unavailable or changed",
            "amounts": payload["amounts"] if supported else {},
            "rule": payload["rule"] if supported else None, "closure": payload["closure"] if supported else None,
            "source": {"id": row["source_id"], "filename": row["filename"], "page": row["page"],
                       "excerpts": evidence if supported else {}, "dateExcerpt": date_excerpt if supported else None},
            "supersedes": row["supersedes"], "related": row["related"],
        })
    return events


def payment_history(connection, cid, events):
    supported = {event["id"] for event in events if event["supported"]}
    history = []
    for row in connection.execute(
            "select * from integrity_payment_investigations where case_id=? order by recorded_at", (cid,)):
        evidence = json.loads(row["evidence"])
        verified = set(evidence) <= supported
        history.append({"eventId": row["event_id"], "recordedAt": row["recorded_at"],
                        "status": row["status"] if verified else "Source evidence unavailable",
                        "expected": row["expected_paise"] if verified else None,
                        "received": row["received_paise"] if verified else None,
                        "evidence": list(key for key in evidence if key in supported)})
    return history


def record_payment_change(connection, cid, eid, timestamp):
    events = load_events(connection, cid)
    current = calculate(events)["amounts"]
    variance = current.get("variance")
    prior = connection.execute(
        "select * from integrity_payment_investigations where case_id=? order by recorded_at desc limit 1", (cid,),
    ).fetchone()
    if not prior and not variance:
        return
    expected, received = (current.get(key) for key in ("expected", "received"))
    status = "Potential payment variance"
    if variance is None:
        if not prior or prior["status"] not in {status, "Requires re-verification"}:
            return
        status = "Reconciled" if expected and received and expected["paise"] == received["paise"] else "Requires re-verification"
    evidence = variance["evidence"] if variance else [
        *dict.fromkeys(key for amount in (expected, received, current.get("settlement")) if amount for key in amount["evidence"])
    ]
    values = (status, expected["paise"] if expected else None, received["paise"] if received else None, json.dumps(evidence))
    if prior and values == (prior["status"], prior["expected_paise"], prior["received_paise"], prior["evidence"]):
        return
    connection.execute("insert into integrity_payment_investigations values(?,?,?,?,?,?,?)",
                       (eid, cid, timestamp, *values))
    audit.record(connection, "integrity.payment-investigation-updated", case_id=cid, object_id=eid)


def snapshot(connection, case, *, detail=True):
    cid = case["id"]
    events = load_events(connection, cid)
    demo = connection.execute("select 1 from integrity_demo_cases where case_id=?", (cid,)).fetchone() is not None
    payer = main.case_json(case)["insurer"]
    editable = not demo and payer in {"Northstar Health", "Northstar Health (fictional)"} and financial_consent(connection, cid)
    profile = payer_profiles.inspect(connection, case, events, demo, editable)
    result = calculate(events, profile["enhancementThresholdPaise"])
    for event in events:
        event["superseded"] = event["id"] in result["superseded"]
    steps = demo_steps() if demo else ()
    review = connection.execute("select * from integrity_reviews where case_id=?", (cid,)).fetchone()
    indexed = {event["id"]: event for event in events}
    for amount in result["amounts"].values():
        amount["effectiveDate"] = max(indexed[key]["date"] for key in amount["evidence"])
        amount["revision"] = case["updated_at"]
        amount["verification"] = "Calculated from verified records" if amount["formula"] else "Verified"
    stage_event = next((event for event in reversed(events) if event["supported"]), None)
    stage = stage_event["kind"] if stage_event else None
    for finding in result["findings"]:
        finding["caseReference"] = cid
        finding["stage"] = stage
        finding["role"] = "Hospital insurance desk"
        finding["resolutionStatus"] = "Open"
        related = [indexed[key]["recordedAt"] for key in finding["evidence"] if key in indexed]
        finding["lastEvidenceAt"] = max(related, default=None)
    return {
        **result, "caseReference": cid, "revision": case["updated_at"], "stage": stage,
        "events": events if detail else [], "profile": profile,
        "outcomes": outcome_intelligence.inspect(connection, cid, events) if detail else None,
        "paymentHistory": payment_history(connection, cid, events) if detail else [],
        "demo": {"next": len(events), "steps": [{"label": step[1]} for step in steps]} if demo else None,
        "review": {"reviewedAt": review["reviewed_at"], "reviewer": review["reviewer"],
                   "current": review["case_revision"] == case["updated_at"]} if review else None,
    }


def financial_consent(connection, cid):
    record = privacy.case_record(connection, cid)
    authorized = json.loads(record["authorization"] or "{}") if record else {}
    return (authorized.get("synthetic") is True and authorized.get("staffConfirmed") is True
            and "financial-claim-records" in authorized.get("categories", []))


def get_case_for_write(connection, cid, revision):
    case = main.mutable_case(cid, connection)
    if case["updated_at"] != revision:
        reject("The case changed. Refresh and review the latest revision before confirming.", 409)
    return case


def add_event(connection, cid, body):
    source_id = str(body.documentId)
    previous = str(body.supersedes) if body.supersedes else None
    related = str(body.related) if body.related else None
    existing = connection.execute(
        "select * from integrity_events where case_id=? and event_key=?", (cid, str(body.eventKey)),
    ).fetchone()
    if existing:
        if (existing["source_id"], existing["page"], existing["kind"], existing["supersedes"], existing["related"]) != (
                source_id, body.page, body.kind, previous, related):
            reject("This event key was already used for a different confirmation.", 409)
        return existing["id"]
    get_case_for_write_after_begin(connection, cid, body.expectedRevision)
    doc = connection.execute("select * from documents where case_id=? and id=?", (cid, source_id)).fetchone()
    if not doc:
        reject("Case document not found.", 404)
    payload, _, _ = parse_source(body.kind, page_text(doc, body.page))
    events = load_events(connection, cid)
    if len(events) >= 500:
        reject("This case reached the 500-event timeline limit.", 409)
    kinds = {event["kind"] for event in events}
    if events and payload["date"] < events[-1]["date"]:
        reject("This source is out of order. Review the effective date against the latest lifecycle event.", 409)
    if not events and body.kind != "admission":
        reject("Start the lifecycle with admission evidence.", 409)
    if not PREREQUISITES.get(body.kind, set()) <= kinds:
        reject("Record the required earlier lifecycle evidence first.", 409)
    if body.kind in {"admission", "initial_authorization"} and body.kind in kinds:
        reject("This lifecycle stage was already recorded. Use the applicable revised event type.", 409)

    by_id = {event["id"]: event for event in events}
    if previous:
        target = by_id.get(previous)
        if (not target or body.kind not in FAMILY or FAMILY.get(target["kind"]) != FAMILY[body.kind]
                or any(event["supersedes"] == previous and event["supported"] for event in events)):
            reject("Select a current event of the same financial type to supersede.", 409)
        if payload["date"] < target["date"]:
            reject("A replacement cannot predate its previous version.", 409)
    if body.kind in ("reversal", "refund"):
        target = by_id.get(related)
        if not target or target["kind"] != "payment" or not target["supported"]:
            reject("Select the verified original payment for this movement.", 409)
        already = [event for event in events if event["related"] == related and event["kind"] in ("reversal", "refund")]
        if any(not event["supported"] for event in already):
            reject("Restore the earlier movement evidence before adding another adjustment.", 409)
        removed = sum(event["amounts"]["payment"] for event in already)
        if removed + payload["amounts"]["payment"] > target["amounts"]["payment"]:
            reject("Reversals and refunds cannot exceed the original payment.", 409)
    elif related:
        reject("Only payment reversals and refunds link to an original payment.")
    if connection.execute(
        """select 1 from integrity_events where case_id=? and
        ((source_id=? and page=?) or transaction_key=?)""", (cid, source_id, body.page, payload["transaction"]),
    ).fetchone():
        reject("This page or payment has already been recorded.", 409)
    eid = str(uuid4())
    recorded = main.now()
    connection.execute(
        "insert into integrity_events values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (eid, cid, str(body.eventKey), body.kind, payload["date"], source_id, body.page, json.dumps(payload),
         previous, related, payload["transaction"], recorded, recorded, audit.actor_id()),
    )
    connection.execute("update cases set updated_at=? where id=?", (recorded, cid))
    audit.record(connection, "integrity.event-verified", case_id=cid, object_id=eid)
    if body.kind in {"bill", "agreement", "settlement", *MOVEMENTS}:
        record_payment_change(connection, cid, eid, recorded)
    return eid


def get_case_for_write_after_begin(connection, cid, revision):
    case = main.getcase(cid, connection)
    if case["status"] == "Processing":
        reject("Wait for document processing to finish.", 409)
    if case["updated_at"] != revision:
        reject("The case changed. Refresh and review the latest revision before confirming.", 409)
    return case


@router.get("/cases/{cid}/integrity")
def get_integrity(cid: str):
    with closing(main.conn()) as connection, connection:
        connection.execute("BEGIN")
        return snapshot(connection, main.getcase(cid, connection))


@router.post("/cases/{cid}/integrity/events")
def record_event(cid: str, body: EventIn):
    with closing(main.conn()) as connection, connection:
        connection.execute("BEGIN IMMEDIATE")
        main.getcase(cid, connection)
        if connection.execute("select 1 from integrity_demo_cases where case_id=?", (cid,)).fetchone():
            reject("Use the guided step controls for the financial demo case.", 409)
        if not financial_consent(connection, cid):
            reject("Record staff confirmation for financial claim records in Case privacy first.", 409)
        eid = add_event(connection, cid, body)
        return {"eventId": eid, **snapshot(connection, main.getcase(cid, connection))}


@router.get("/cases/{cid}/integrity/summary")
def staff_summary(cid: str):
    with closing(main.conn()) as connection, connection:
        connection.execute("BEGIN")
        data = snapshot(connection, main.getcase(cid, connection), detail=False)
        keys = ("estimate", "authorization", "authorization_gap", "bill", "adjustment", "responsibility", "received")
        return {"stage": data["stage"], "reviewed": bool(data["review"] and data["review"]["current"]),
                "amounts": {key: data["amounts"][key]["paise"] for key in keys if key in data["amounts"]},
                "findings": [{key: finding[key] for key in ("id", "category", "status", "action")}
                             for finding in data["findings"]]}


@router.post("/cases/{cid}/integrity/outcomes")
def record_outcome(cid: str, body: OutcomeIn):
    outcome_type = outcome_intelligence.CATEGORIES.get(body.category)
    if not outcome_type or body.reason not in outcome_intelligence.REASONS:
        reject("Choose an outcome and a documented reason category.")
    with closing(main.conn()) as connection, connection:
        case = get_case_for_write(connection, cid, body.expectedRevision)
        if not outcome_intelligence.allowed(privacy.case_record(connection, cid)):
            reject("Outcome feedback is available for synthetic cases.", 403)
        data = snapshot(connection, case)
        event = next((entry for entry in data["events"] if entry["id"] == str(body.eventId) and entry["supported"]), None)
        if not event or event["kind"] not in outcome_type[1]:
            reject("Choose a verified event of the appropriate type from this case.")
        if body.category == "partial-settlement" and event["closure"] != "partial":
            reject("The recorded advice does not describe a partial settlement.")
        if body.category == "full-settlement" and event["closure"] != "final":
            reject("The recorded advice does not describe a final settlement.")
        if body.category == "administrative-resolution" and any(
                finding["id"] in {"payment-variance", "outstanding-payment", "missing-payment", "remittance-mismatch"}
                for finding in data["findings"]):
            reject("Reconcile payment findings before recording administrative resolution.", 409)
        previous = connection.execute("select reason from integrity_outcomes where case_id=? and event_id=? and category=?",
                                      (cid, event["id"], body.category)).fetchone()
        if previous:
            if previous["reason"] != body.reason:
                reject("This outcome already has a recorded reason.", 409)
            return data
        identifier = str(uuid4())
        amount = next(iter(event["amounts"].values()), None)
        connection.execute("insert into integrity_outcomes values(?,?,?,?,?,?,?,?,?)",
                           (identifier, cid, event["id"], body.category, body.reason, amount,
                            data["profile"]["version"], main.now(), audit.actor_id()))
        audit.record(connection, "integrity.outcome-recorded", case_id=cid, object_id=identifier, outcome="simulated")
        return snapshot(connection, case)


def require_profile_edit(connection, cid, revision):
    case = get_case_for_write(connection, cid, revision)
    data = snapshot(connection, case)
    if not data["profile"]["editable"]:
        reject("Confirm fictional financial processing on an ordinary case before editing its profile.", 403)
    return case, data["profile"]


@router.post("/cases/{cid}/integrity/profile/versions")
def propose_profile(cid: str, body: ProfileProposalIn):
    with closing(main.conn()) as connection, connection:
        case, profile = require_profile_edit(connection, cid, body.expectedRevision)
        parent = next((item for item in profile["history"] if item["version"] == body.parent and item["approver"]), None)
        if not parent:
            reject("Choose an approved parent profile version.")
        if body.expiryDate and body.expiryDate < body.effectiveDate:
            reject("The profile expiry cannot predate its effective date.")
        if body.effectiveDate.isoformat() < parent["effectiveDate"]:
            reject("The revised profile cannot predate its parent version.")
        payer_profiles.propose(connection, cid, body.parent, body.effectiveDate.isoformat(),
                               body.expiryDate.isoformat() if body.expiryDate else None,
                               body.enhancementThresholdPaise, main.now())
        return snapshot(connection, case)


@router.post("/cases/{cid}/integrity/profile/versions/{version}/approve")
def approve_profile(cid: str, version: str, body: RevisionIn):
    with closing(main.conn()) as connection, connection:
        case, profile = require_profile_edit(connection, cid, body.expectedRevision)
        if not any(item["version"] == version for item in profile["history"]):
            reject("Profile version not found for this case.", 404)
        payer_profiles.approve(connection, cid, version, main.now())
        return snapshot(connection, case)


@router.put("/cases/{cid}/integrity/profile")
def pin_profile(cid: str, body: ProfilePinIn):
    with closing(main.conn()) as connection, connection:
        case, profile = require_profile_edit(connection, cid, body.expectedRevision)
        if body.version == profile["pinnedVersion"]:
            return snapshot(connection, case)
        if body.version:
            selected = next((entry for entry in profile["history"] if entry["version"] == body.version), None)
            if not selected or not payer_profiles.applies(selected, profile["asOf"]):
                reject("Select an approved profile version applicable to this case date.")
            connection.execute("""insert into integrity_profile_pins values(?,?) on conflict(case_id)
                                  do update set version=excluded.version""", (cid, body.version))
        else:
            connection.execute("delete from integrity_profile_pins where case_id=?", (cid,))
        connection.execute("update cases set updated_at=? where id=?", (main.now(), cid))
        audit.record(connection, "integrity.profile-pinned", case_id=cid, object_id=body.version)
        return snapshot(connection, main.getcase(cid, connection))


@router.post("/cases/{cid}/integrity/simulate")
def run_simulation(cid: str, body: SimulationIn):
    with closing(main.conn()) as connection, connection:
        connection.execute("BEGIN")
        case = main.getcase(cid, connection)
        if case["updated_at"] != body.expectedRevision:
            reject("Refresh the case before simulating this revision.", 409)
        current = snapshot(connection, case)
        try:
            return simulate(current["events"], current, body.action, body.paise, current["profile"]["enhancementThresholdPaise"])
        except ValueError as failure:
            reject(str(failure))


@router.post("/cases/{cid}/integrity/review")
def approve_review(cid: str, body: RevisionIn):
    with closing(main.conn()) as connection, connection:
        case = get_case_for_write(connection, cid, body.expectedRevision)
        if not load_events(connection, cid):
            reject("Record lifecycle evidence before reviewing the financial report.")
        if not financial_consent(connection, cid) and not connection.execute(
                "select 1 from integrity_demo_cases where case_id=?", (cid,)).fetchone():
            reject("Staff confirmation for financial claim records is required.", 409)
        changed = connection.execute(
            """insert into integrity_reviews values(?,?,?,?) on conflict(case_id) do update
            set case_revision=excluded.case_revision, reviewed_at=excluded.reviewed_at, reviewer=excluded.reviewer
            where integrity_reviews.case_revision != excluded.case_revision""",
            (cid, case["updated_at"], main.now(), audit.actor_id()),
        ).rowcount
        if changed:
            audit.record(connection, "integrity.report-reviewed", case_id=cid)
        return snapshot(connection, case)


from .integrity_demo import demo_steps, open_demo, record_demo_step


@router.post("/demo/aarav-financial")
def get_demo():
    return {"id": open_demo()}


@router.post("/cases/{cid}/integrity/demo-step")
def demo_step(cid: str, body: DemoStepIn):
    return record_demo_step(cid, body)


@router.delete("/cases/{cid}/integrity/demo")
def reset_demo(cid: str):
    if os.getenv("DEMO_LOGIN_ENABLED") != "1":
        reject("Financial demonstration is disabled.", 403)
    with main.agent.case_lock(cid):
        with closing(main.conn()) as connection:
            main.getcase(cid, connection)
            if not connection.execute("select 1 from integrity_demo_cases where case_id=?", (cid,)).fetchone():
                reject("This is not the financial demo case.", 404)
        return main.delete_case_data(cid)


@router.get("/cases/{cid}/integrity/{report}.pdf")
def report_pdf(cid: str, report: Literal["report", "investigation", "patient-summary"],
               revision: str = Query(min_length=1, max_length=64)):
    from .integrity_reports import render
    with closing(main.conn()) as connection, connection:
        connection.execute("BEGIN IMMEDIATE")
        case = main.getcase(cid, connection)
        data = snapshot(connection, case)
        if revision != data["revision"] or not data["review"] or not data["review"]["current"]:
            reject("Review the current case revision before exporting this report.", 409)
        if not data["demo"] and not financial_consent(connection, cid):
            reject("Staff confirmation for financial claim records is required.", 409)
        record = privacy.case_record(connection, cid)
        authorization = json.loads(record["authorization"] or "{}") if record else {}
        response = render(report, data, main.case_json(case)["hospitalName"],
                          authorization.get("synthetic") is True)
        audit.record(connection, "integrity.report-exported", case_id=cid, outcome=report)
        return response

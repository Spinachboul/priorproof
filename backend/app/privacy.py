"""Case privacy records and deterministic, read-only document screening."""

from collections import Counter
from contextlib import closing
from datetime import date, datetime, timezone
import json
from pathlib import Path
import re
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import audit

NOTICE_VERSION = "PP-NOTICE-2026-11-v1"
RETENTION_POLICY = "PP-RETENTION-v1"
CLASSIFICATIONS = {"Required for the stated workflow", "Potentially unnecessary", "Requires staff review"}
RULES = json.loads(Path(__file__).with_name("privacy_rules.json").read_text())
patterns = [
    ("Bank account", r"(?im)\b(?:bank[ \t]+account|account[ \t]+(?:number|no\.?))"
     r"(?:[ \t]+(?:number|no\.?))?[ \t]*[:#=-][ \t]*(?P<value>\d(?:[ -]?\d){8,17})(?![ -]?\d)"),
    ("Aadhaar", r"(?im)\b(?:aadhaar|aadhar|uidai)(?:[ \t]+(?:number|no\.?))?[ \t]*[:#=-][ \t]*"
     r"(?P<value>\d{4}[ -]?\d{4}[ -]?\d{4})(?![ -]?\d)"),
    ("Telephone", r"(?im)\b(?:phone|telephone|mobile|contact[ \t]+number)(?:[ \t]+(?:number|no\.?))?"
     r"[ \t]*[:#=-][ \t]*(?P<value>\+?\d(?:[ ()-]?\d){9,14})(?![ -]?\d)"),
    ("PAN", r"(?im)\bPAN(?:[ \t]+(?:number|no\.?))?[ \t]*[:#=-][ \t]*(?P<value>[A-Z]{5}[0-9]{4}[A-Z])\b"),
    ("Email", r"(?i)(?P<value>[A-Z0-9._%+\-]+@[A-Z0-9.-]+\.[A-Z]{2,63})\b"),
    ("PAN", r"\b(?P<value>[A-Z]{5}[0-9]{4}[A-Z])\b"),
    ("Aadhaar", r"(?<![\w-])(?P<value>[2-9]\d{3}[ -]\d{4}[ -]\d{4})(?![\w-])"),
    ("Telephone", r"(?<![\w-])(?P<value>\+91[ -]?[6-9]\d{4}[ -]?\d{5})(?!\d)"),
]
DETECTORS = [(category, re.compile(pattern)) for category, pattern in patterns]
DETECTORS.extend((rule["category"], re.compile(rule["pattern"])) for rule in RULES["customIdentifiers"])

SCHEMA = """
CREATE TABLE IF NOT EXISTS case_privacy (
  case_id TEXT PRIMARY KEY, authorization TEXT, retention_review TEXT, legal_hold INTEGER NOT NULL DEFAULT 0,
  retention_updated_at TEXT
);
CREATE TABLE IF NOT EXISTS document_privacy_reviews (
  case_id TEXT NOT NULL, document_id TEXT NOT NULL, decision TEXT NOT NULL, reviewed_at TEXT NOT NULL,
  actor_id TEXT NOT NULL, PRIMARY KEY(case_id,document_id)
);
CREATE TABLE IF NOT EXISTS privacy_requests (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL,
  status TEXT NOT NULL, outcome TEXT, resolved_at TEXT, resolved_by TEXT
);
CREATE INDEX IF NOT EXISTS privacy_requests_case ON privacy_requests(case_id,created_at);
"""
router = APIRouter(prefix="/api/cases/{cid}/privacy")


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AuthorizationIn(Input):
    purpose: Literal["preauthorization", "workflow-training"]
    categories: list[Literal["patient-identification", "clinical-records", "insurance", "cost-estimates"]] = Field(min_length=1, max_length=4)
    recipients: list[Literal["hospital-desk", "authorized-reviewers", "insurer-or-tpa"]] = Field(min_length=1, max_length=3)
    basis: Literal["synthetic-demonstration", "consent-recorded-externally", "certain-legitimate-use", "pending-review"]
    noticeVersion: Literal["PP-NOTICE-2026-11-v1"]
    staffConfirmed: Literal[True]
    synthetic: Literal[True]

    @field_validator("staffConfirmed", "synthetic", mode="before")
    @classmethod
    def explicit_confirmation(cls, value):
        if value is not True:
            raise ValueError("Explicit confirmation is required for this fictional case")
        return value


class RetentionIn(Input):
    reviewDate: date | None
    legalHold: bool = Field(strict=True)
    confirmHoldRelease: bool = Field(default=False, strict=True)


class DocumentReviewIn(Input):
    decision: Literal["reviewed", "follow-up-required"]


class RequestIn(Input):
    kind: Literal["access", "correction", "erasure", "grievance"]


class ResolutionIn(Input):
    status: Literal["in-review", "closed"]
    outcome: Literal["answered-externally", "referred", "restricted", "withdrawn"] | None = None


def detect(text):
    """Return offsets and categories only. Prefer a labelled match on overlap."""
    candidates = []
    for priority, (category, pattern) in enumerate(DETECTORS):
        for match in pattern.finditer(text):
            start, end = match.span("value")
            candidates.append((start, priority, end, category))
    spans = []
    for start, _, end, category in sorted(candidates):
        if not spans or start >= spans[-1][1]:
            spans.append((start, end, category))
    return spans


def classified(category, purpose):
    value = RULES["purpose"].get(purpose, {}).get(category, RULES["default"].get(category))
    return value if value in CLASSIFICATIONS else "Requires staff review"


def masked_preview(text, spans):
    pieces, previous = [], 0
    for start, end, category in spans:
        pieces.extend((text[previous:start], f"[{category} masked]"))
        previous = end
    pieces.append(text[previous:])
    return "".join(pieces)


def save_authorization(connection, cid, payload):
    record = payload.model_dump()
    record.update(confirmedAt=service.now(), actor=audit.actor_id())
    connection.execute("""insert into case_privacy(case_id,authorization) values(?,?)
                       on conflict(case_id) do update set authorization=excluded.authorization""",
                       (cid, json.dumps(record)))
    audit.record(connection, "privacy.authorization-recorded", case_id=cid, object_id=cid)


def seed_authorization(connection, cid):
    record = dict(purpose="workflow-training", categories=["patient-identification", "clinical-records", "insurance", "cost-estimates"],
                  recipients=["hospital-desk", "authorized-reviewers"], basis="synthetic-demonstration",
                  noticeVersion=NOTICE_VERSION, staffConfirmed=False, synthetic=True, confirmedAt=None, actor="system")
    connection.execute("insert or ignore into case_privacy(case_id,authorization) values(?,?)", (cid, json.dumps(record)))


def backfill_demo(connection):
    for row in connection.execute("""select id from cases where json_extract(data,'$.patientName')='Aarav Sharma'
                                  and json_extract(data,'$.patientId') in ('DEMO-1024','DEMO-GUIDED-1024')"""):
        seed_authorization(connection, row["id"])


def case_record(connection, cid):
    return connection.execute("select * from case_privacy where case_id=?", (cid,)).fetchone()


def deletion_restriction(record):
    if record is not None:
        if record["legal_hold"]:
            return "A legal hold is recorded. Resolve it through the applicable organizational process before deletion."
        if record["retention_review"] and date.fromisoformat(record["retention_review"]) > datetime.now(timezone.utc).date():
            return "The configured retention review date has not arrived."
    return None


def last_processing(connection, cid):
    row = connection.execute("""select max(timestamp) from audit_events
                              where case_id=? and action in ('analysis.completed','analysis.failed')""", (cid,)).fetchone()
    return row[0]


def lifecycle(connection, case, record):
    restriction = deletion_restriction(record)
    if case["status"] == "Processing":
        restriction = "Wait for document processing to finish."
    return dict(createdAt=case["created_at"], lastProcessingAt=last_processing(connection, case["id"]),
                reviewDate=record["retention_review"] if record else None, policyReference=RETENTION_POLICY,
                legalHold=bool(record and record["legal_hold"]), eligible=restriction is None, restriction=restriction)


def get_document(connection, cid, did):
    service.getcase(cid, connection)
    row = connection.execute("select * from documents where case_id=? and id=?", (cid, did)).fetchone()
    if row is None:
        raise HTTPException(404, "Document not found")
    return row


def document_profile(document, purpose):
    pages = [(page, text, detect(text)) for page, text in service.document_pages(document["filename"], document["text"])]
    counts = Counter(category for _, _, matches in pages for _, _, category in matches)
    findings = [dict(category=category, count=count, maskedValue=f"[{category} masked]",
                     classification=classified(category, purpose)) for category, count in sorted(counts.items())]
    return pages, findings


def stored_review(connection, cid, did):
    row = connection.execute("""select decision,reviewed_at,actor_id from document_privacy_reviews
                             where case_id=? and document_id=?""", (cid, did)).fetchone()
    return dict(row) if row else None


def profile(connection, case, *, include_pages=False):
    cid = case["id"]
    record = case_record(connection, cid)
    authorization = json.loads(record["authorization"]) if record and record["authorization"] else None
    purpose = authorization["purpose"] if authorization else None
    documents = []
    for doc in connection.execute("select * from documents where case_id=? order by created_at", (cid,)):
        _, findings = document_profile(doc, purpose)
        item = dict(id=doc["id"], category=doc["category"], findings=findings, staffReview=stored_review(connection, cid, doc["id"]))
        if include_pages:
            item["pages"] = doc["pages"]
        documents.append(item)
    requests = [dict(row) for row in connection.execute(
        "select id,kind,created_at,status,outcome,resolved_at,resolved_by from privacy_requests where case_id=? order by created_at desc", (cid,))]
    return dict(caseReference=cid, authorization=authorization, noticeVersion=NOTICE_VERSION,
                lifecycle=lifecycle(connection, case, record), documents=documents, requests=requests)


@router.get("")
def get_privacy(cid: str):
    with closing(service.conn()) as c, c:
        c.execute("BEGIN")
        return profile(c, service.getcase(cid, c), include_pages=True)


@router.put("/authorization")
def record_authorization(cid: str, body: AuthorizationIn):
    with closing(service.conn()) as c, c:
        c.execute("BEGIN IMMEDIATE")
        service.getcase(cid, c)
        save_authorization(c, cid, body)
    return get_privacy(cid)


@router.get("/documents/{did}")
def preview(cid: str, did: str, page: int = Query(1, ge=1)):
    with closing(service.conn()) as c, c:
        c.execute("BEGIN IMMEDIATE")
        doc = get_document(c, cid, did)
        record = case_record(c, cid)
        purpose = json.loads(record["authorization"])["purpose"] if record and record["authorization"] else None
        pages, findings = document_profile(doc, purpose)
        if page > max(doc["pages"], 1):
            raise HTTPException(404, "Document page not found")
        text, spans = next(((text, spans) for number, text, spans in pages if number == page), ("", []))
        audit.record(c, "privacy.preview-viewed", case_id=cid, object_id=did)
        return dict(page=page, text=masked_preview(text, spans), findings=findings, review=stored_review(c, cid, did))


@router.put("/documents/{did}/review")
def review_document(cid: str, did: str, body: DocumentReviewIn):
    with closing(service.conn()) as c, c:
        c.execute("BEGIN IMMEDIATE")
        get_document(c, cid, did)
        if (stored_review(c, cid, did) or {}).get("decision") != body.decision:
            c.execute("""insert into document_privacy_reviews values(?,?,?,?,?)
                      on conflict(case_id,document_id) do update set decision=excluded.decision,
                      reviewed_at=excluded.reviewed_at,actor_id=excluded.actor_id""",
                      (cid, did, body.decision, service.now(), audit.actor_id()))
            audit.record(c, "privacy.document-reviewed", case_id=cid, object_id=did, outcome=body.decision)
        return stored_review(c, cid, did)


@router.put("/retention")
def update_retention(cid: str, body: RetentionIn):
    with closing(service.conn()) as c, c:
        c.execute("BEGIN IMMEDIATE")
        case = service.getcase(cid, c)
        previous = case_record(c, cid)
        if previous and previous["legal_hold"] and not body.legalHold and not body.confirmHoldRelease:
            raise HTTPException(409, "Confirm that the organizational legal hold was cleared before removing the restriction")
        c.execute("""insert into case_privacy(case_id,retention_review,legal_hold,retention_updated_at) values(?,?,?,?)
                  on conflict(case_id) do update set retention_review=excluded.retention_review,
                  legal_hold=excluded.legal_hold,retention_updated_at=excluded.retention_updated_at""",
                  (cid, body.reviewDate.isoformat() if body.reviewDate else None, body.legalHold, service.now()))
        audit.record(c, "privacy.retention-updated", case_id=cid, object_id=cid,
                     outcome="hold-active" if body.legalHold else "hold-inactive")
        return lifecycle(c, case, case_record(c, cid))


@router.post("/requests")
def create_request(cid: str, body: RequestIn):
    with closing(service.conn()) as c, c:
        c.execute("BEGIN IMMEDIATE")
        service.getcase(cid, c)
        rid = str(uuid4())
        c.execute("insert into privacy_requests(id,case_id,kind,created_at,status) values(?,?,?,?,'recorded')",
                  (rid, cid, body.kind, service.now()))
        audit.record(c, "privacy.request-recorded", case_id=cid, object_id=rid, outcome=body.kind)
    return {"id": rid}


@router.put("/requests/{rid}")
def update_request(cid: str, rid: str, body: ResolutionIn):
    if (body.status == "closed") != bool(body.outcome):
        raise HTTPException(422, "A closed request needs a recorded outcome")
    with closing(service.conn()) as c, c:
        c.execute("BEGIN IMMEDIATE")
        service.getcase(cid, c)
        row = c.execute("select status,outcome from privacy_requests where case_id=? and id=?", (cid, rid)).fetchone()
        if row is None:
            raise HTTPException(404, "Privacy request not found")
        if row["status"] == body.status and row["outcome"] == body.outcome:
            return {"status": body.status}
        if row["status"] == "closed":
            raise HTTPException(409, "The recorded outcome of a closed request is final")
        c.execute("update privacy_requests set status=?,outcome=?,resolved_at=?,resolved_by=? where case_id=? and id=?",
                  (body.status, body.outcome, service.now() if body.outcome else None,
                   audit.actor_id() if body.outcome else None, cid, rid))
        audit.record(c, "privacy.request-updated", case_id=cid, object_id=rid, outcome=body.outcome or body.status)
    return {"status": body.status}


@router.get("/summary")
def summary(cid: str):
    with closing(service.conn()) as c, c:
        c.execute("BEGIN IMMEDIATE")
        result = profile(c, service.getcase(cid, c))
        audit.record(c, "privacy.summary-downloaded", case_id=cid, object_id=cid)
        result["activity"] = [dict(row) for row in c.execute(
            """select action,actor_id,object_id,timestamp,outcome from audit_events
              where case_id=? order by timestamp desc limit 100""", (cid,))]
    trust = service.trust_config()
    counts = Counter()
    reviews = Counter()
    for document in result["documents"]:
        for finding in document["findings"]:
            counts[finding["category"]] += finding["count"]
        review = document["staffReview"]
        reviews[review["decision"] if review else "pending"] += 1
    result.update(title="PriorProof processing and privacy summary",
                  findingCounts=dict(sorted(counts.items())), reviewCounts=dict(sorted(reviews.items())),
                  localAI={k: trust[k] for k in ("provider", "model", "localInference", "transmission")},
                  limitations=["Fictional demo using a shared account. Staff confirmation records an administrative action.",
                               "Preview masking is heuristic and text-only. Originals and exported clinical packets may contain identifiers.",
                               "Storage encryption, trusted transport, organizational retention, complete rights fulfillment, and independent validation require separate controls.",
                               "Application deletion cannot recall downloaded files or external backups."])
    return JSONResponse(result, headers={"Content-Disposition": 'attachment; filename="PriorProof-privacy-summary.json"'})


from . import main as service

"""Isolated, synthetic financial journey using the existing protected document store."""
import json
import os
from contextlib import closing
from uuid import uuid4, uuid5, UUID

from fastapi import HTTPException
from . import audit, main, privacy
from .financial_reconciliation import CONTRACT_RULE

NAMESPACE = UUID("b529d942-c1d5-4181-8c88-8b1cd2489a49")


def demo_steps():
    return (
        ("admission", "Admission", "2026-11-26", ()),
        ("estimate", "Initial estimate · INR 85,000", "2026-11-26", (
            ("Estimated treatment cost", "INR 85000"),)),
        ("initial_authorization", "Initial authorization · INR 70,000", "2026-11-27", (
            ("Authorized amount", "INR 70000"),)),
        ("treatment_update", "Revised treatment estimate · INR 1,15,000", "2026-11-28", (
            ("Estimated treatment cost", "INR 115000"),)),
        ("enhancement_request", "Enhancement request", "2026-11-28", ()),
        ("revised_authorization", "Revised authorization · INR 90,000", "2026-11-29", (
            ("Authorized amount", "INR 90000"),)),
        ("bill", "Final bill · INR 1,15,000", "2026-11-30", (
            ("Gross billed amount", "INR 115000"),)),
        ("agreement", "Verified fictional agreement and patient responsibility", "2026-11-30", (
            ("Contractual adjustment", "INR 15000"), ("Contractually allowable amount", "INR 100000"),
            ("Patient responsibility", "INR 10000"), ("Reimbursement rule", CONTRACT_RULE))),
        ("settlement", "Settlement advice · INR 82,000", "2026-12-05", (
            ("Insurer settlement amount", "INR 82000"), ("Settlement status", "final"))),
        ("payment", "First payment confirmation · INR 82,000", "2026-12-05", (
            ("Confirmed payment", "INR 82000"), ("Transaction reference", "FICTIONAL-AARAV-001"))),
        ("payment", "Additional payment confirmation · INR 8,000", "2026-12-08", (
            ("Confirmed payment", "INR 8000"), ("Transaction reference", "FICTIONAL-AARAV-002"))),
        ("settlement", "Revised settlement advice · INR 90,000", "2026-12-08", (
            ("Insurer settlement amount", "INR 90000"), ("Settlement status", "final"))),
        ("resolution", "Administrative resolution", "2026-12-08", ()),
    )


def require_demo():
    if os.getenv("DEMO_LOGIN_ENABLED") != "1":
        raise HTTPException(403, "Financial demonstration is disabled.")


def open_demo():
    require_demo()
    with closing(main.conn()) as connection, connection:
        connection.execute("BEGIN IMMEDIATE")
        existing = connection.execute(
            "select case_id from integrity_demo_cases where owner_id=?", (main.DEMO_SUBJECT,),
        ).fetchone()
        if existing:
            return existing["case_id"]
        cid, timestamp = str(uuid4()), main.now()
        data = main.CaseIn(patientName="Aarav Sharma · Complete Financial Journey", patientId="DEMO-FINANCIAL",
                          hospitalName="Green Valley Multispecialty Hospital (fictional)",
                          admissionDate="2026-11-26", insurer="Northstar Health (fictional)")
        connection.execute(
            "insert into cases(id,data,status,created_at,updated_at,owner_id) values(?,?,?,?,?,?)",
            (cid, data.model_dump_json(exclude={"processingAuthorization"}), "Draft", timestamp, timestamp, main.DEMO_SUBJECT),
        )
        connection.execute("insert into integrity_demo_cases values(?,?)", (cid, main.DEMO_SUBJECT))
        privacy.seed_authorization(connection, cid)
        row = privacy.case_record(connection, cid)
        record = json.loads(row["authorization"])
        record["categories"] += ["financial-claim-records"]
        connection.execute("update case_privacy set authorization=? where case_id=?", (json.dumps(record), cid))
        audit.record(connection, "integrity.demo-opened", case_id=cid, object_id=cid)
        return cid


def record_demo_step(cid, body):
    from .claim_integrity import CATEGORY, EventIn, add_event, snapshot
    require_demo()
    steps = demo_steps()
    if body.step >= len(steps):
        raise HTTPException(422, "That demonstration step does not exist.")
    file_path = None
    try:
        with closing(main.conn()) as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            case = main.getcase(cid, connection)
            if not connection.execute("select 1 from integrity_demo_cases where case_id=?", (cid,)).fetchone():
                raise HTTPException(404, "This is not the financial demo case.")
            key = uuid5(NAMESPACE, f"{cid}:{body.step}")
            duplicate = connection.execute(
                "select 1 from integrity_events where case_id=? and event_key=?", (cid, str(key)),
            ).fetchone()
            if duplicate:
                return snapshot(connection, case)
            if case["updated_at"] != body.expectedRevision or case["status"] == "Processing":
                raise HTTPException(409, "Refresh before confirming this step.")
            current = snapshot(connection, case)
            if current["demo"]["next"] != body.step:
                raise HTTPException(409, "Confirm the demo stages in order.")
            kind, _, effective, lines = steps[body.step]
            content = "\n".join(("Fictional PriorProof financial demonstration", f"Record type: {kind}",
                                 f"Effective date: {effective}", *(f"{k}: {v}" for k, v in lines)))
            folder = main.UPLOAD / cid
            folder.mkdir(parents=True, exist_ok=True)
            file_path = folder / f"{uuid4()}.pdf"
            main.write_demo_pdf(file_path, content)
            text, pages = main.extract_upload_text(file_path, ".pdf")[:2]
            # Keep a single original PDF in the normal upload store and the usual indexed page text.
            doc = main.add_doc(cid, f"financial-{body.step + 1:02d}-{kind}.pdf", CATEGORY,
                               str(file_path), text, pages, connection)
            replace = {"treatment_update": "estimate", "revised_authorization": "initial_authorization", "settlement": "settlement"}.get(kind)
            previous = next((e["id"] for e in reversed(current["events"]) if e["kind"] == replace), None)
            add_event(connection, cid, EventIn(
                expectedRevision=body.expectedRevision, staffConfirmed=True, eventKey=key,
                kind=kind, documentId=doc, page=1, supersedes=previous,
            ))
            audit.record(connection, "document.uploaded", case_id=cid, object_id=doc)
            return snapshot(connection, main.getcase(cid, connection))
    except Exception:
        if file_path:
            file_path.unlink(missing_ok=True)
        raise

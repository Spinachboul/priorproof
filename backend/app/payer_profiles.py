"""Case-scoped governance for a synthetic rule profile and its revisions."""
import json
from datetime import date
from pathlib import Path
from uuid import uuid4

from . import audit

BASE = json.loads(Path(__file__).with_name("synthetic_payer_profiles.json").read_text())
BASE_VERSION = BASE["version"]
SCHEMA = """
create table if not exists integrity_profile_versions(
    version TEXT PRIMARY KEY, case_id TEXT NOT NULL, parent TEXT NOT NULL,
    effective_date TEXT NOT NULL, expiry_date TEXT, threshold_paise INTEGER NOT NULL,
    proposed_at TEXT NOT NULL, proposer TEXT NOT NULL, approved_at TEXT, approver TEXT
);
create index if not exists integrity_profile_case on integrity_profile_versions(case_id, proposed_at);
create table if not exists integrity_profile_pins(
    case_id TEXT PRIMARY KEY, version TEXT NOT NULL
);
"""


def history(connection, cid):
    base = {
        "version": BASE_VERSION, "parent": None, "effectiveDate": BASE["effectiveDate"], "expiryDate": BASE["expiryDate"],
        "enhancementThresholdPaise": BASE["enhancementThresholdPaise"],
        "proposedAt": None, "proposer": "system", "approvedAt": None, "approver": "system",
    }
    rows = connection.execute(
        """select version, parent, effective_date as effectiveDate, expiry_date as expiryDate,
                  threshold_paise as enhancementThresholdPaise, proposed_at as proposedAt, proposer,
                  approved_at as approvedAt, approver
           from integrity_profile_versions where case_id=? order by proposed_at""", (cid,),
    )
    return [base, *(dict(row) for row in rows)]


def applies(entry, as_of):
    return bool(entry["approver"] and entry["effectiveDate"] <= as_of
                and (not entry["expiryDate"] or as_of <= entry["expiryDate"]))


def inspect(connection, case, events, demo, editable):
    cid = case["id"]
    pin = connection.execute("select version from integrity_profile_pins where case_id=?", (cid,)).fetchone()
    pinned = BASE_VERSION if demo else pin["version"] if pin else None
    versions = history(connection, cid) if demo or editable or pin else []
    as_of = events[-1]["date"] if events else date.today().isoformat()
    active = next((entry for entry in versions if entry["version"] == pinned), None)
    applicable = (demo or editable) and active is not None and applies(active, as_of)
    if applicable:
        return {
            **BASE, **active, "editable": editable, "asOf": as_of, "pinnedVersion": pinned,
            "history": versions, "verified": BASE["verification"], "requirements": [
                stage["stage"] + ": " + ", ".join(stage["documents"]) + "." for stage in BASE["workflowRequirements"]
            ],
        }
    return {
        "name": "Generic document verification", "version": None, "pinnedVersion": pinned,
        "editable": editable, "history": versions, "asOf": as_of, "verified": "Requires hospital confirmation",
        "source": None, "enhancementThresholdPaise": None, "workflowRequirements": [],
        "requirements": ["Confirm the applicable payer, policy, hospital terms and documents with staff."],
    }


def propose(connection, cid, parent, effective, expiry, threshold, now):
    if connection.execute(
            """select 1 from integrity_profile_versions
               where case_id=? and parent=? and effective_date=? and expiry_date is ? and threshold_paise=?""",
            (cid, parent, effective, expiry, threshold)).fetchone():
        return
    version = "demo-" + str(uuid4())
    connection.execute("insert into integrity_profile_versions values(?,?,?,?,?,?,?,?,NULL,NULL)",
                       (version, cid, parent, effective, expiry, threshold, now, audit.actor_id()))
    audit.record(connection, "integrity.profile-proposed", case_id=cid, object_id=version)


def approve(connection, cid, version, now):
    changed = connection.execute(
        """update integrity_profile_versions set approved_at=?,approver=?
           where case_id=? and version=? and approved_at is null""",
        (now, audit.actor_id(), cid, version),
    ).rowcount
    if changed:
        audit.record(connection, "integrity.profile-approved", case_id=cid, object_id=version)

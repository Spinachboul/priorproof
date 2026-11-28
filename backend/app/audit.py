from contextvars import ContextVar
from datetime import datetime, timezone
from uuid import uuid4

session_id = ContextVar("priorproof_session_id", default=None)

SCHEMA = """
create table if not exists audit_events(
    id TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL,
    session_id TEXT,
    case_id TEXT,
    action TEXT NOT NULL,
    object_id TEXT,
    timestamp TEXT NOT NULL,
    outcome TEXT NOT NULL
);
create index if not exists audit_case_timestamp on audit_events(case_id, timestamp);
create table if not exists file_cleanup(
    case_id TEXT NOT NULL,
    path TEXT NOT NULL,
    primary key (case_id, path)
);
"""


def actor_id():
    return "demo-user" if session_id.get() else "system"


def record(connection, action, *, case_id=None, object_id=None, outcome="succeeded", actor=None):
    session = session_id.get()
    connection.execute(
        "insert into audit_events values(?,?,?,?,?,?,?,?)",
        (str(uuid4()), actor or actor_id(), session, case_id,
         action, object_id, datetime.now(timezone.utc).isoformat(), outcome),
    )

"""Bounded pre-authorization preparation with local, durable LangGraph state."""

from contextlib import closing, contextmanager
from dataclasses import dataclass
import json
import os
from threading import RLock
from time import monotonic
from typing import Literal, TypedDict
from urllib.parse import urlencode
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime
from langgraph.types import Command, interrupt
from langsmith import tracing_context
from pydantic import BaseModel, ConfigDict, Field
import requests

router = APIRouter(prefix="/api/cases/{cid}/agent")
OBJECTIVE = "Prepare an evidence-backed pre-authorization draft for staff review."
MAX_ITERATIONS = 36
MAX_SECONDS = 45
TERMINAL = {"completed", "stopped", "cancelled"}
LOCKS = tuple(RLock() for _ in range(64))

Tool = Literal["inspect_case", "extract_document", "verify_evidence", "check_requirements",
               "detect_conflicts", "evaluate_readiness", "request_human_input", "generate_draft_packet"]
TaskKind = Literal["missing_document", "missing_field", "conflict", "verify_evidence", "approve_draft"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DocumentRef(StrictModel):
    id: str
    category: str


class EvidenceRef(StrictModel):
    id: str
    name: str
    document_id: str | None
    page: int | None
    status: str
    review: str


class ConflictRef(StrictModel):
    name: str
    field_ids: list[str]


class HumanTask(StrictModel):
    id: str
    kind: TaskKind
    subject: str
    field_ids: list[str] = Field(default_factory=list)


class ToolInput(StrictModel):
    case_id: str
    revision: str


class ToolOutput(StrictModel):
    summary: str
    documents: list[DocumentRef] | None = None
    evidence: list[EvidenceRef] | None = None
    missing: list[str] | None = None
    conflicts: list[ConflictRef] | None = None
    tasks: list[HumanTask] | None = None
    needs_extraction: bool | None = None
    score: float | None = None
    revision: str | None = None
    packet: str | None = None
    warnings: list[str] | None = None


class HumanInput(StrictModel):
    task_id: str = Field(max_length=100)
    revision: str = Field(max_length=64)
    confirmed: Literal[True]


class TaskChoice(StrictModel):
    option: int = Field(strict=True, ge=1)


class State(TypedDict, total=False):
    run_id: str
    case_id: str
    user_scope: str
    revision: str
    documents: list[dict]
    evidence: list[dict]
    missing: list[str]
    conflicts: list[dict]
    tasks: list[dict]
    history: list[dict]
    current_task: str
    errors: list[str]
    warnings: list[str]
    status: str
    iterations: int
    phase: str
    seen: list[str]
    needs_extraction: bool
    score: float
    packet: str
    approval_revision: str
    selection: str


@dataclass
class RunContext:
    deadline: float

    def remaining(self):
        remaining = self.deadline - monotonic()
        if remaining < 0.25:
            raise StopRun("The execution time limit was reached.")
        return remaining


class StopRun(Exception):
    pass


def case_lock(cid):
    return LOCKS[hash(cid) % len(LOCKS)]


def setup():
    with closing(service.conn()) as connection, connection:
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS agent_runs (
                id TEXT PRIMARY KEY, case_id TEXT NOT NULL, owner_id TEXT NOT NULL,
                revision TEXT NOT NULL, created_at TEXT NOT NULL, cancelled INTEGER DEFAULT 0,
                human_input TEXT
            );
            CREATE INDEX IF NOT EXISTS agent_runs_case ON agent_runs(case_id, created_at);
            CREATE TABLE IF NOT EXISTS agent_extractions (
                run_id TEXT NOT NULL, revision TEXT NOT NULL, committed_revision TEXT NOT NULL,
                PRIMARY KEY (run_id, revision)
            );
        """)
        SqliteSaver(connection).setup()


def delete_runs(connection, cid):
    for table in ("writes", "checkpoints", "agent_extractions"):
        key = "run_id" if table == "agent_extractions" else "thread_id"
        connection.execute(f"delete from {table} where {key} in (select id from agent_runs where case_id=?)", (cid,))
    connection.execute("delete from agent_runs where case_id=?", (cid,))


def run_row(cid, run_id=None):
    with closing(service.conn()) as connection, connection:
        connection.execute("BEGIN")
        case = service.getcase(cid, connection)
        return connection.execute(
            """select * from agent_runs where case_id=? and owner_id=? and (? is null or id=?)
               order by created_at desc limit 1""",
            (cid, case["owner_id"], run_id, run_id),
        ).fetchone()


def require_run(cid, run_id):
    row = run_row(cid, run_id)
    if row is None:
        raise HTTPException(404, "Agent run not found")
    return row


def snapshot(params, state, *, detail=True):
    with closing(service.conn()) as connection, connection:
        connection.execute("BEGIN")
        case = service.getcase(params.case_id, connection)
        if case["owner_id"] != state["user_scope"]:
            raise StopRun("Case access changed.")
        if case["updated_at"] != params.revision or case["status"] == "Processing":
            raise StopRun("Case changed during execution. Start a new run to reconcile the current case.")
        if not detail:
            return
        case_detail = service.case_snapshot(case, connection)
        case_detail["agentNeedsExtraction"] = processing_needed(case_detail) or changes_need_analysis(connection, params.case_id)
        return case_detail


def processing_needed(case):
    return case["status"] in {"Documents Uploaded", "Processing Failed"}


def changes_need_analysis(connection, cid):
    latest = connection.execute(
        """select action from audit_events where case_id=? and action in
           ('document.uploaded', 'document.removed', 'analysis.completed') order by timestamp desc limit 1""",
        (cid,),
    ).fetchone()
    return latest is not None and latest["action"] != "analysis.completed"


def inspect_case(params, case):
    return ToolOutput(summary="Inspected the current case and its document references.",
                      needs_extraction=bool(case["documents"]) and case["agentNeedsExtraction"],
                      documents=[DocumentRef(id=d["id"], category=d["category"]) for d in case["documents"]])


def check_requirements(params, case):
    missing = [item["requirement"] for item in case["checklist"] if item["status"] == "Missing"]
    return ToolOutput(summary=f"Checked the policy checklist. {len(missing)} required categories missing.", missing=missing)


def detect_conflicts(params, case):
    conflicts = [ConflictRef(name=c["field"], field_ids=[v["fieldId"] for v in c["values"]])
                 for c in case["conflicts"]]
    return ToolOutput(summary=f"Found {len(conflicts)} unresolved conflicts.", conflicts=conflicts)


def verify_evidence(params, case):
    refs = [EvidenceRef(id=f["id"], name=f["name"], document_id=f["source_doc"],
                        page=f["page"], status=f["evidenceStatus"], review=f["review"])
            for f in case["fields"]]
    return ToolOutput(summary=f"Checked source support for {len(refs)} field references. Staff review remains required.",
                      evidence=refs)


def readiness_tasks(case):
    readiness = case["readiness"]
    conflicts = {c["field"]: [v["fieldId"] for v in c["values"]] for c in case["conflicts"]}
    tasks = []
    for blocker in readiness["blockers"]:
        subject = blocker["subject"]
        target = blocker.get("target", "")
        if subject == "Document processing":
            continue
        field_ids = []
        if target == "upload-documents":
            kind = "missing_field" if subject in readiness["missingEssentialFields"] else "missing_document"
        elif blocker.get("title") == "Resolve the contradictory values":
            kind, field_ids = "conflict", conflicts[subject]
        else:
            kind = "verify_evidence"
            if target.startswith("field-"):
                field_ids = [target.removeprefix("field-")]
        tasks.append(HumanTask(id=f"{kind}:{field_ids[0] if field_ids else subject}",
                               kind=kind, subject=subject, field_ids=field_ids))
    return list({task.id: task for task in tasks}.values())


def evaluate_readiness(params, case):
    readiness = case["readiness"]
    warnings = []
    if case["unsupportedProposals"]:
        warnings.append("Some extracted proposals lacked source support and were excluded.")
    if any("readable text" in d["status"] or "OCR failed" in d["status"] for d in case["documents"]):
        warnings.append("Some document pages may need a clearer scan.")
    if readiness["override"]:
        warnings.append("A staff override is recorded. The agent still applies the preparation blockers.")
    return ToolOutput(summary=f"Readiness score is {readiness['score']:g}%. {len(readiness['blockers'])} blockers remain.",
                      score=readiness["score"], tasks=readiness_tasks(case), warnings=warnings)


READ_TOOLS = {
    "inspect_case": inspect_case, "check_requirements": check_requirements,
    "detect_conflicts": detect_conflicts, "verify_evidence": verify_evidence,
    "evaluate_readiness": evaluate_readiness,
}
FLOW = {
    "inspect_case": "check_requirements", "check_requirements": "assess",
    "extract_document": "inspect_case", "detect_conflicts": "verify_evidence",
    "verify_evidence": "evaluate_readiness",
}


def extract_document(params, state, context):
    with closing(service.conn()) as connection:
        existing = connection.execute(
            "select committed_revision from agent_extractions where run_id=? and revision=?",
            (state["run_id"], params.revision),
        ).fetchone()
    if existing:
        revision = existing["committed_revision"]
    else:
        def commit(connection, revision):
            context.remaining()
            if connection.execute("select cancelled from agent_runs where id=?", (state["run_id"],)).fetchone()[0]:
                raise StopRun("The run was cancelled.")
            connection.execute("insert into agent_extractions values (?,?,?)",
                               (state["run_id"], params.revision, revision))

        revision = service.process_case(params.case_id, expected_revision=params.revision,
                                        remaining=context.remaining, committed=commit)
    return ToolOutput(summary="Ran the existing document extraction service and updated the case.", revision=revision)


def choose_task(tasks, context):
    # Missing documents are a prerequisite. A local model can prioritize between
    # distinct staff task types only when there is no prerequisite determining the choice.
    first = next((task for task in tasks if task.kind == "missing_document"), None)
    if first is not None:
        return first, "deterministic rules"
    by_kind = {}
    for task in tasks:
        by_kind.setdefault(task.kind, task)
    candidates = list(by_kind.values())
    if len(candidates) <= 1:
        return tasks[0], "deterministic rules"
    if os.getenv("AGENT_PLANNER", "ollama").lower() != "ollama":
        return tasks[0], "deterministic fallback (planner disabled)"
    try:
        budget = min(context.remaining(), 12)
        # Only server-defined task kinds and counts are passed to the planner.
        options = [{"option": i, "kind": task.kind,
                    "count": sum(t.kind == task.kind for t in tasks)} for i, task in enumerate(candidates, start=1)]
        schema = TaskChoice.model_json_schema()
        schema["properties"]["option"]["enum"] = [option["option"] for option in options]
        with requests.Session() as session:
            session.trust_env = False
            response = session.post(service.ollama_base() + "/api/chat", json={
                "model": os.getenv("OLLAMA_MODEL", "qwen3:4b"),
                "messages": [
                    {"role": "system", "content": "Choose the next staff task group for pre-authorization preparation. Return only an allowed option number in JSON."},
                    {"role": "user", "content": json.dumps(options)},
                ],
                "stream": False, "think": False, "format": schema,
                "options": {"temperature": 0, "num_ctx": 1024, "num_predict": 48},
            }, timeout=(min(1, budget / 3), budget * 2 / 3), allow_redirects=False)
            response.raise_for_status()
            if response.is_redirect:
                raise ValueError("Planner redirected")
            choice = TaskChoice.model_validate_json(response.json()["message"]["content"])
        return candidates[choice.option - 1], "local Ollama"
    except (requests.RequestException, ValueError, IndexError, KeyError, TypeError):
        return tasks[0], "deterministic fallback (planner unavailable or invalid)"


def request_human_input(params, state, context):
    tasks = [HumanTask.model_validate(task) for task in state["tasks"]]
    priority, mode = choose_task(tasks, context)
    return ToolOutput(summary="Requested staff input about " + priority.subject + ".",
                      tasks=[priority, *[task for task in tasks if task != priority]]), mode


def generate_draft_packet(params, state):
    # The existing packet service prepares a revision-specific download link.
    # The authorized download endpoint renders the actual PDF on demand.
    with closing(service.conn()) as connection, connection:
        connection.execute("BEGIN IMMEDIATE")
        case = service.getcase(params.case_id, connection)
        current = service.case_snapshot(case, connection)
        cancelled = connection.execute("select cancelled from agent_runs where id=?", (state["run_id"],)).fetchone()[0]
        if (cancelled or case["owner_id"] != state["user_scope"] or
                case["updated_at"] != params.revision or state.get("approval_revision") != params.revision
                or current["readiness"]["blockers"]):
            raise StopRun("Draft preparation requires current readiness and staff approval.")
        packet = service.prepare_packet(params.case_id, connection)["downloadUrl"]
    return ToolOutput(summary="Prepared the staff-approved PDF draft for download.",
                      packet=f"{packet}?{urlencode({'revision': params.revision})}")


def next_tool(state):
    phase = state["phase"]
    if phase == "assess":
        return "extract_document" if state["needs_extraction"] else "detect_conflicts"
    if phase == "resolve":
        return "generate_draft_packet" if state.get("approval_revision") == state["revision"] else "request_human_input"
    return phase


def invoke_tool(tool: Tool, params: ToolInput, state, context):
    if tool not in READ_TOOLS and tool not in {"extract_document", "request_human_input", "generate_draft_packet"}:
        raise StopRun("Requested action is outside the agent tool allowlist.")
    if tool != next_tool(state):
        raise StopRun("Requested action is not permitted in the current workflow state.")
    if tool == "extract_document":
        if not state.get("needs_extraction") or not state.get("documents"):
            raise StopRun("No document extraction is required.")
        return extract_document(params, state, context), "deterministic rules"
    if tool in READ_TOOLS:
        return READ_TOOLS[tool](params, snapshot(params, state)), "deterministic rules"
    if tool == "request_human_input":
        snapshot(params, state, detail=False)
        return request_human_input(params, state, context)
    return generate_draft_packet(params, state), "deterministic rules"


def stopped(message, status="stopped"):
    return {"status": status, "errors": [] if status == "cancelled" else [message],
            "current_task": message, "tasks": []}


def execute(state: State, runtime: Runtime[RunContext]):
    context = runtime.context
    tool = next_tool(state)
    params = ToolInput(case_id=state["case_id"], revision=state["revision"])
    signature = f"{params.revision}:{tool}"
    try:
        context.remaining()
        row = require_run(params.case_id, state["run_id"])
        if row["cancelled"]:
            return stopped("Run cancelled by staff.", "cancelled")
        if signature in state["seen"]:
            raise StopRun("A tool would repeat without a case revision change.")
        if state["iterations"] >= MAX_ITERATIONS:
            raise StopRun("The agent iteration limit was reached.")
        result, mode = invoke_tool(tool, params, state, context)
        context.remaining()
        # Read tools, including a local planner call, may run while another client edits the case.
        snapshot(ToolInput(case_id=params.case_id, revision=result.revision or params.revision), state, detail=False)
    except StopRun as error:
        return stopped(str(error))
    except HTTPException as error:
        return stopped("Case changed or access was lost during execution.") if error.status_code in {404, 409} else stopped("A permitted service could not complete the action.")
    except Exception as error:
        service.log.error("Agent tool failed (%s, %s)", tool, type(error).__name__)
        return stopped("A permitted service failed. Check document processing and start a new run.")
    update = result.model_dump(exclude_none=True)
    summary = update.pop("summary")
    update.update(current_task=summary, selection=mode, iterations=state["iterations"] + 1,
                  seen=[*state["seen"], signature], history=[*state["history"], {
                      "tool": tool, "summary": summary, "selection": mode, "revision": params.revision,
                      "at": service.now(),
                  }])
    if tool in FLOW:
        update["phase"] = FLOW[tool]
    elif tool == "evaluate_readiness":
        update["phase"] = "resolve"
        if not update["tasks"] and state.get("approval_revision") != params.revision:
            update["tasks"] = [HumanTask(id="approve_draft", kind="approve_draft", subject="Prepare the PDF draft").model_dump()]
    elif tool == "request_human_input":
        update["status"] = "waiting"
    else:
        update["status"] = "completed"
    return update


def wait_for_staff(state: State):
    raw = interrupt({"tasks": state["tasks"], "revision": state["revision"]})
    response = HumanInput.model_validate(raw)
    try:
        case = snapshot(ToolInput(case_id=state["case_id"], revision=response.revision), state)
    except (StopRun, HTTPException):
        return stopped("Case changed after staff input. Start a new run to reconcile the current case.")
    if response.task_id == "approve_draft":
        if case["readiness"]["blockers"] or response.revision != state["revision"]:
            return stopped("Draft approval was invalidated by a case change.")
        # The approval shares the current revision. The request tool will not run again.
        return {"status": "running", "tasks": [], "approval_revision": response.revision,
                "phase": "resolve", "current_task": "Preparing the approved PDF draft."}
    return {"status": "running", "tasks": [], "revision": response.revision,
            "phase": "inspect_case", "current_task": "Rechecking the updated case."}


def route_step(state):
    if state["status"] in TERMINAL:
        return END
    return "staff" if state["status"] == "waiting" else "execute"


def route_staff(state):
    return END if state["status"] in TERMINAL else "execute"


def config(run_id):
    return {"configurable": {"thread_id": run_id}, "recursion_limit": MAX_ITERATIONS * 3 + 12}


@contextmanager
def graph_session():
    with closing(service.sqlite3.connect(service.DB, check_same_thread=False)) as connection:
        connection.execute("pragma secure_delete=ON")
        workflow = StateGraph(State, context_schema=RunContext)
        workflow.add_node("execute", execute)
        workflow.add_node("staff", wait_for_staff)
        workflow.add_edge(START, "execute")
        workflow.add_conditional_edges("execute", route_step, {"execute": "execute", "staff": "staff", END: END})
        workflow.add_conditional_edges("staff", route_staff, {"execute": "execute", END: END})
        yield workflow.compile(checkpointer=SqliteSaver(connection))


def initial(row):
    return State(run_id=row["id"], case_id=row["case_id"], user_scope=row["owner_id"], revision=row["revision"],
                 documents=[], evidence=[], missing=[], conflicts=[], tasks=[], history=[], errors=[], warnings=[],
                 current_task="Inspecting the case.", status="running", iterations=0, phase="inspect_case", seen=[])


def public_run(row, graph):
    checkpoint = graph.get_state(config(row["id"]))
    state = checkpoint.values or initial(row)
    response = dict(state)
    for key in ("seen", "phase", "user_scope", "approval_revision", "needs_extraction"):
        response.pop(key, None)
    case = service.getcase(row["case_id"])
    response.update(objective=OBJECTIVE, current_revision=case["updated_at"],
                    input_received=bool(row["human_input"]), interrupted=bool(checkpoint.interrupts))
    if state["status"] == "waiting" and case["updated_at"] != state["revision"]:
        warning = ("Draft approval expired after a case change. Cancel this run and start preparation again."
                   if any(task["kind"] == "approve_draft" for task in state["tasks"])
                   else "The case changed while the agent was waiting. Confirm the completed task to recheck the latest case.")
        response["warnings"] = [*state["warnings"], warning]
    if row["cancelled"]:
        response.update(stopped("Run cancelled by staff.", "cancelled"), packet=None, interrupted=False)
    elif state.get("packet") and case["updated_at"] != state["revision"]:
        response.update(packet=None, warnings=[*state["warnings"], "The case changed after this draft was prepared."])
    return response


def advance(row, graph, value):
    with tracing_context(enabled=False):
        graph.invoke(value, config(row["id"]), context=RunContext(monotonic() + MAX_SECONDS),
                     durability="sync")


def mutation(cid):
    # PriorProof's existing SQLite demo deployment uses one API worker.
    @contextmanager
    def acquire():
        lock = case_lock(cid)
        if not lock.acquire(blocking=False):
            raise HTTPException(409, "An agent request is already running for this case")
        try:
            yield
        finally:
            lock.release()
    return acquire()


@router.post("/runs")
def start(cid: str):
    with mutation(cid), graph_session() as graph:
        last = run_row(cid)
        if last is not None:
            current = public_run(last, graph)
            if current["status"] not in TERMINAL:
                return current
        with closing(service.conn()) as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            case = service.getcase(cid, connection)
            if case["status"] == "Processing":
                raise HTTPException(409, "Wait for document processing to finish")
            run_id = str(uuid4())
            connection.execute("insert into agent_runs (id,case_id,owner_id,revision,created_at) values (?,?,?,?,?)",
                               (run_id, cid, case["owner_id"], case["updated_at"], service.now()))
            service.audit.record(connection, "agent.started", case_id=cid, object_id=run_id)
        row = require_run(cid, run_id)
        advance(row, graph, initial(row))
        return public_run(require_run(cid, run_id), graph)


@router.get("/runs/latest")
def latest(cid: str):
    row = run_row(cid)
    with graph_session() as graph:
        return public_run(row, graph) if row is not None else None


@router.get("/runs/{run_id}")
def status(cid: str, run_id: str):
    with graph_session() as graph:
        return public_run(require_run(cid, run_id), graph)


@router.get("/runs/{run_id}/trace")
def trace(cid: str, run_id: str):
    return status(cid, run_id)["history"]


@router.get("/runs/{run_id}/tasks")
def tasks(cid: str, run_id: str):
    return status(cid, run_id)["tasks"]


def validate_input(body, current, case):
    task = next((task for task in current["tasks"] if task["id"] == body.task_id), None)
    if task is None or body.revision != case["updatedAt"] or case["status"] == "Processing":
        raise HTTPException(409, "Refresh the case and confirm a current requested task")
    if task["kind"] == "approve_draft":
        if body.revision == current["revision"] and not case["readiness"]["blockers"]:
            return
        raise HTTPException(409, "Case revision or readiness changed. Cancel this run and start a new one")
    if body.revision == current["revision"]:
        raise HTTPException(409, "Complete the requested case update first")
    if task["kind"] == "missing_document":
        if any(d["category"] == task["subject"] and d["id"] not in {old["id"] for old in current["documents"]}
               for d in case["documents"]):
            return
    elif task["kind"] == "missing_field" and processing_needed(case):
        if {d["id"] for d in case["documents"]} - {d["id"] for d in current["documents"]}:
            return
    if task["id"] not in {item.id for item in readiness_tasks(case)}:
        return
    raise HTTPException(409, "The requested task still needs a document or staff review decision")


@router.post("/runs/{run_id}/input")
def provide_input(cid: str, run_id: str, body: HumanInput):
    with mutation(cid), graph_session() as graph:
        row = require_run(cid, run_id)
        current = public_run(row, graph)
        if current["status"] != "waiting" or not current["interrupted"]:
            raise HTTPException(409, "The run is not waiting for staff input")
        with closing(service.conn()) as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            case = service.getcase(cid, connection)
            validate_input(body, current, service.case_snapshot(case, connection))
            if row["human_input"] != body.model_dump_json():
                connection.execute("update agent_runs set human_input=? where id=? and cancelled=0",
                                   (body.model_dump_json(), run_id))
                service.audit.record(connection, "agent.staff-confirmed", case_id=cid, object_id=run_id)
        return public_run(require_run(cid, run_id), graph)


@router.post("/runs/{run_id}/resume")
def resume(cid: str, run_id: str):
    with mutation(cid), graph_session() as graph:
        row = require_run(cid, run_id)
        current = public_run(row, graph)
        if current["status"] in TERMINAL:
            return current
        if current["interrupted"]:
            if not row["human_input"]:
                raise HTTPException(409, "Confirm a completed task before resuming")
            body = HumanInput.model_validate_json(row["human_input"])
            validate_input(body, current, service.case_detail(cid))
            value = Command(resume=body.model_dump())
        else:
            value = None if graph.get_state(config(run_id)).values else initial(row)
        advance(row, graph, value)
        if row["human_input"]:
            with closing(service.conn()) as connection, connection:
                connection.execute("update agent_runs set human_input=null where id=?", (run_id,))
        return public_run(require_run(cid, run_id), graph)


@router.post("/runs/{run_id}/cancel")
def cancel(cid: str, run_id: str):
    row = require_run(cid, run_id)
    with graph_session() as graph:
        current = public_run(row, graph)
        if current["status"] in TERMINAL:
            return current
        with closing(service.conn()) as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            service.getcase(cid, connection)
            updated = connection.execute("update agent_runs set cancelled=1, human_input=null where id=? and cancelled=0", (run_id,))
            if updated.rowcount:
                service.audit.record(connection, "agent.cancelled", case_id=cid, object_id=run_id)
        return public_run(require_run(cid, run_id), graph)


# The FastAPI module owns the existing case services and mounts the router above.
from . import main as service

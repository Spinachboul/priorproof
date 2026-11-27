from __future__ import annotations
import os, re, json, uuid, sqlite3, logging, mimetypes
from xml.sax.saxutils import escape
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Any
import pymupdf as fitz
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
)

ROOT = Path(__file__).resolve().parents[1]
# Load a simple local .env without adding a settings dependency.
for line in (
    (ROOT / ".env").read_text().splitlines() if (ROOT / ".env").exists() else []
):
    if line.strip() and not line.lstrip().startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip("\"'"))
DB = Path(os.getenv("DATABASE_PATH", str(ROOT / "data/priorproof.db")))
UPLOAD = Path(os.getenv("UPLOAD_DIR", str(ROOT / "data/uploads")))
DB.parent.mkdir(parents=True, exist_ok=True)
UPLOAD.mkdir(parents=True, exist_ok=True)
MAX_BYTES = int(os.getenv("MAX_UPLOAD_MB", "15")) * 1024 * 1024
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("priorproof")
app = FastAPI(title="PriorProof API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)


def conn():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c


def now():
    return datetime.now(timezone.utc).isoformat()


def init_db():
    with conn() as c:
        c.executescript(
            """CREATE TABLE IF NOT EXISTS cases(id TEXT PRIMARY KEY,data TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,submission TEXT,review_notes TEXT);
  CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,case_id TEXT NOT NULL,filename TEXT NOT NULL,category TEXT NOT NULL,stored TEXT NOT NULL,pages INTEGER DEFAULT 0,text TEXT DEFAULT '',status TEXT DEFAULT 'Uploaded',created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS fields(id TEXT PRIMARY KEY,case_id TEXT NOT NULL,group_name TEXT NOT NULL,name TEXT NOT NULL,value TEXT,original TEXT,source_doc TEXT,source_name TEXT,page INTEGER,evidence TEXT,confidence REAL,review TEXT NOT NULL,origin TEXT NOT NULL DEFAULT 'AI-extracted');"""
        )
        if "review_notes" not in [
            r["name"] for r in c.execute("pragma table_info(cases)")
        ]:
            c.execute("alter table cases add column review_notes TEXT")


def getcase(cid):
    with conn() as c:
        r = c.execute("select * from cases where id=?", (cid,)).fetchone()
    if not r:
        raise HTTPException(404, "Case not found")
    return r


def case_json(r):
    d = json.loads(r["data"])
    d.update(
        id=r["id"],
        status=r["status"],
        createdAt=r["created_at"],
        updatedAt=r["updated_at"],
        submission=json.loads(r["submission"]) if r["submission"] else None,
        reviewNotes=r["review_notes"],
    )
    return d


class CaseIn(BaseModel):
    patientName: str = ""
    patientId: str = ""
    age: Optional[int] = None
    gender: str = ""
    hospitalName: str = "Green Valley Multispecialty Hospital"
    admissionDate: str = ""
    department: str = ""
    insurer: str = ""
    policyNumber: str = ""
    policyType: str = ""
    tpa: str = ""
    reason: str = ""
    diagnosis: str = ""
    treatment: str = ""
    estimatedCost: Optional[float] = None


class ReviewIn(BaseModel):
    value: Optional[str] = None
    review: str = Field(
        pattern="^(Unreviewed|Verified|Edited|Rejected|Unable to Verify)$"
    )
    reason: Optional[str] = None


class ExtractedField(BaseModel):
    group: str
    name: str
    value: str
    evidence: str
    confidence: float = Field(default=0.75, ge=0, le=1)


def insert_case(data, status="Draft"):
    cid = str(uuid.uuid4())
    t = now()
    with conn() as c:
        c.execute(
            "insert into cases(id,data,status,created_at,updated_at,submission) values(?,?,?,?,?,NULL)",
            (cid, data.model_dump_json(), status, t, t),
        )
    return cid


def add_doc(cid, name, category, stored, text, pages):
    did = str(uuid.uuid4())
    with conn() as c:
        c.execute(
            "insert into documents(id,case_id,filename,category,stored,text,pages,status,created_at) values(?,?,?,?,?,?,? ,?,?)",
            (
                did,
                cid,
                name,
                category,
                stored,
                text,
                pages,
                "Processed" if text else "Uploaded",
                now(),
            ),
        )
    return did


def add_field(
    cid,
    grp,
    name,
    value,
    doc=None,
    page=None,
    evidence=None,
    confidence=0.96,
    review="Unreviewed",
    origin="AI-extracted",
):
    did = doc["id"] if doc else None
    filename = doc["filename"] if doc else None
    with conn() as c:
        c.execute(
            "insert into fields values(?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                str(uuid.uuid4()),
                cid,
                grp,
                name,
                value,
                value,
                did,
                filename,
                page,
                evidence,
                confidence,
                review,
                origin,
            ),
        )


def ocr_image(image):
    try:
        import pytesseract

        return pytesseract.image_to_string(image)
    except Exception as e:
        log.info("Local OCR unavailable (%s)", type(e).__name__)
        return ""


def extract_upload_text(path: Path, ext: str):
    if ext != ".pdf":
        try:
            from PIL import Image

            return ocr_image(Image.open(path)), 1
        except Exception:
            return "", 1
    doc = fitz.open(path)
    pages = doc.page_count
    chunks = []
    for i, page in enumerate(doc):  # type: ignore
        text = page.get_text().strip()
        if not text:
            try:
                from PIL import Image

                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
                text = ocr_image(image).strip()
            except Exception as e:
                log.info("Scanned PDF OCR failed (%s)", type(e).__name__)
        if text:
            chunks.append(f"[{i+1}] {text}")
    doc.close()
    return "\n".join(chunks), pages


def get_docs(cid):
    with conn() as c:
        return [
            dict(x)
            for x in c.execute(
                "select id,filename,category,pages,status,created_at from documents where case_id=? order by created_at",
                (cid,),
            )
        ]


def get_fields(cid):
    with conn() as c:
        return [
            dict(x)
            for x in c.execute(
                "select * from fields where case_id=? order by rowid", (cid,)
            )
        ]


def ensure_demo():
    with conn() as c:
        if c.execute("select count(*) n from cases").fetchone()["n"]:
            return
    data = CaseIn(
        patientName="Aarav Sharma",
        patientId="DEMO-1024",
        age=34,
        gender="Male",
        hospitalName="Green Valley Multispecialty Hospital",
        admissionDate="2026-11-26",
        department="General Surgery",
        insurer="Northstar Health (fictional)",
        policyNumber="NS-DEMO-8821",
        policyType="Family Floater",
        tpa="ClearPath TPA (fictional)",
        reason="Acute abdominal pain",
        diagnosis="Acute appendicitis",
        treatment="Laparoscopic appendectomy",
        estimatedCost=85000,
    )
    cid = insert_case(data, "Needs Review")
    sources = [
        (
            "Admission_Notes.pdf",
            "Admission notes",
            "Patient: Aarav Sharma\nPatient ID: DEMO-1024\nAge: 34 years\nGender: Male\nAdmission date: 26 November 2026\nReason: Acute abdominal pain.",
        ),
        (
            "Doctor_Clinical_Notes.pdf",
            "Clinical notes",
            "Patient: Aarav Sharma\nAge: 34 years\nDoctor assessment: Acute right lower quadrant abdominal pain with tenderness and guarding.\nProvisional diagnosis: Acute appendicitis.\nPlan: Laparoscopic appendectomy.",
        ),
        (
            "Diagnostic_Report.pdf",
            "Diagnostic reports",
            "Patient: Aarav Sharma\nTest: Ultrasound abdomen\nDate: 26 November 2026\nFinding: Enlarged non-compressible appendix measuring 9 mm with surrounding inflammatory change.",
        ),
        (
            "Treatment_Plan.pdf",
            "Treatment plans",
            "Patient: Aarav Sharma\nRecommended treatment: Laparoscopic appendectomy under general anaesthesia.\nAdmission date: 27 November 2026.",
        ),
        (
            "Hospital_Cost_Estimate.pdf",
            "Cost estimates",
            "Patient: Aarav Sharma\nEstimated hospitalization cost: INR 85,000\nRoom charges: INR 18,000\nProcedure charges: INR 42,000\nInvestigations and medicines: INR 25,000.",
        ),
    ]
    docs = []
    for name, cat, txt in sources:
        path = UPLOAD / f"{uuid.uuid4()}.pdf"
        pdf = fitz.open()
        page = pdf.new_page()
        page.insert_text((64, 80), txt, fontsize=12)
        pdf.save(path)
        pdf.close()
        docs.append(
            {
                "id": add_doc(cid, name, cat, str(path), txt, 1),
                "filename": name,
                "text": txt,
            }
        )
    policy = "Fictional Northstar Health demo policy. Cashless pre-authorization checklist: admission notes, treating doctor assessment, diagnostic report supporting admission, treatment recommendation, hospital cost estimate, and insurance identification document. Requirements are illustrative only."
    p = UPLOAD / f"{uuid.uuid4()}.pdf"
    pdf = fitz.open()
    pdf.new_page().insert_text((64, 80), policy, fontsize=12)
    pdf.save(p)
    pdf.close()
    add_doc(cid, "Demo_Insurance_Policy.pdf", "Insurance policy", str(p), policy, 1)

    def finddoc(i):
        return docs[i]

    for grp, name, value, di, phrase in [
        (
            "Patient information",
            "Patient name",
            "Aarav Sharma",
            0,
            "Patient: Aarav Sharma",
        ),
        ("Patient information", "Patient ID", "DEMO-1024", 0, "Patient ID: DEMO-1024"),
        ("Patient information", "Age", "34 years", 0, "Age: 34 years"),
        ("Patient information", "Gender", "Male", 0, "Gender: Male"),
        (
            "Clinical information",
            "Admission date",
            "26 November 2026",
            0,
            "Admission date: 26 November 2026",
        ),
        (
            "Clinical information",
            "Provisional diagnosis",
            "Acute appendicitis",
            1,
            "Provisional diagnosis: Acute appendicitis.",
        ),
        (
            "Clinical information",
            "Symptoms",
            "Acute right lower quadrant abdominal pain",
            1,
            "Acute right lower quadrant abdominal pain",
        ),
        (
            "Clinical information",
            "Doctor observations",
            "Tenderness and guarding",
            1,
            "tenderness and guarding",
        ),
        (
            "Diagnostic information",
            "Test name",
            "Ultrasound abdomen",
            2,
            "Test: Ultrasound abdomen",
        ),
        (
            "Diagnostic information",
            "Diagnostic finding",
            "Enlarged non-compressible appendix measuring 9 mm",
            2,
            "Enlarged non-compressible appendix measuring 9 mm",
        ),
        (
            "Treatment information",
            "Recommended treatment",
            "Laparoscopic appendectomy",
            3,
            "Recommended treatment: Laparoscopic appendectomy",
        ),
        (
            "Billing information",
            "Estimated hospitalization cost",
            "₹85,000",
            4,
            "Estimated hospitalization cost: INR 85,000",
        ),
    ]:
        d = finddoc(di)
        add_field(
            cid, grp, name, value, {"id": d["id"], "filename": d["filename"]}, 1, phrase
        )
    # Deliberate conflict: conflicting admission date on treatment plan.
    d = finddoc(3)
    add_field(
        cid,
        "Clinical information",
        "Admission date",
        "27 November 2026",
        {"id": d["id"], "filename": d["filename"]},
        1,
        "Admission date: 27 November 2026",
    )


@app.on_event("startup")
def startup():
    init_db()
    ensure_demo()


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "provider": os.getenv("AI_PROVIDER", "mock"),
        "ollamaModel": os.getenv("OLLAMA_MODEL", "qwen3:4b"),
    }


@app.get("/api/cases")
def list_cases():
    with conn() as c:
        rows = c.execute("select * from cases order by created_at desc").fetchall()
    out = []
    for r in rows:
        item = case_json(r)
        with conn() as c:
            item["documentCount"] = c.execute(
                "select count(*) n from documents where case_id=?", (r["id"],)
            ).fetchone()["n"]
        out.append(item)
    return out


@app.post("/api/cases")
def create_case(payload: CaseIn):
    cid = insert_case(payload)
    return case_json(getcase(cid))


@app.get("/api/cases/{cid}")
def case_detail(cid: str):
    r = getcase(cid)
    x = case_json(r)
    x["documents"] = get_docs(cid)
    x["fields"] = get_fields(cid)
    x["checklist"] = checklist(cid)
    x["conflicts"] = conflicts(cid)
    x["reviewSummary"] = review_summary(cid)
    return x


@app.put("/api/cases/{cid}")
def update_case(cid: str, payload: CaseIn):
    getcase(cid)
    with conn() as c:
        c.execute(
            "update cases set data=?,updated_at=? where id=?",
            (payload.model_dump_json(), now(), cid),
        )
    return case_json(getcase(cid))


@app.post("/api/cases/{cid}/documents")
async def upload(
    cid: str, files: list[UploadFile] = File(...), categories: list[str] = Form(...)
):
    getcase(cid)
    if len(files) != len(categories):
        raise HTTPException(400, "Select a category for each file")
    out = []
    for f, cat in zip(files, categories):
        ext = Path(f.filename or "").suffix.lower()
        if ext not in (".pdf", ".png", ".jpg", ".jpeg"):
            raise HTTPException(415, f'Unsupported file type: {ext or "unknown"}')
        content = await f.read(MAX_BYTES + 1)
        if len(content) > MAX_BYTES:
            raise HTTPException(413, "File exceeds configured upload limit")
        valid_signature = (
            (ext == ".pdf" and content.startswith(b"%PDF-"))
            or (ext == ".png" and content.startswith(b"\x89PNG\r\n\x1a\n"))
            or (ext in (".jpg", ".jpeg") and content.startswith(b"\xff\xd8\xff"))
        )
        if not valid_signature:
            raise HTTPException(
                415, "File contents do not match the selected document type"
            )
        name = Path(f.filename or "document").name[:160]
        stored = UPLOAD / f"{uuid.uuid4()}{ext}"
        stored.write_bytes(content)
        text = ""
        pages = 1
        try:
            text, pages = extract_upload_text(stored, ext)
        except Exception:
            stored.unlink(missing_ok=True)
            raise HTTPException(400, "Could not read this document")
        did = add_doc(cid, name, cat, str(stored), text, pages)
        out.append(
            {
                "id": did,
                "filename": name,
                "category": cat,
                "pages": pages,
                "status": "Processed" if text.strip() else "Uploaded — OCR unavailable",
            }
        )
    return {"documents": out}


@app.delete("/api/cases/{cid}/documents/{did}")
def remove_doc(cid: str, did: str):
    with conn() as c:
        r = c.execute(
            "select stored from documents where id=? and case_id=?", (did, cid)
        ).fetchone()
    if not r:
        raise HTTPException(404, "Document not found")
    Path(r["stored"]).unlink(missing_ok=True)
    with conn() as c:
        c.execute("delete from documents where id=?", (did,))
        c.execute("delete from fields where source_doc=?", (did,))
    return {"ok": True}


def mock_extract(text):
    # Narrow deterministic demo extraction: fields only from explicit source patterns.
    rules = [
        ("Patient information", "Patient name", r"Patient:\s*([A-Z][^\n]+)"),
        ("Patient information", "Patient ID", r"Patient ID:\s*([^\n]+)"),
        ("Patient information", "Age", r"Age:\s*([^\n]+)"),
        (
            "Clinical information",
            "Provisional diagnosis",
            r"Provisional diagnosis:\s*([^\.\n]+)",
        ),
        (
            "Treatment information",
            "Recommended treatment:",
            r"Recommended treatment:\s*([^\.\n]+)",
        ),
        (
            "Billing information",
            "Estimated hospitalization cost",
            r"Estimated hospitalization cost:\s*([^\n]+)",
        ),
        ("Diagnostic information", "Test name", r"Test:\s*([^\n]+)"),
    ]
    found = []
    for grp, name, pat in rules:
        m = re.search(pat, text, re.I)
        if m:
            found.append((grp, name, m.group(1).strip(), m.group(0)))
    return found


def text_pages(text):
    # PDF extraction stores each page with an explicit marker. Do not claim page 1
    # evidence for a later page. Plain OCR text represents a single image/page.
    parts = re.split(r"(?m)^\[(\d+)\]\s*", text)
    if len(parts) > 1:
        return [
            (int(parts[i]), parts[i + 1])
            for i in range(1, len(parts) - 1, 2)
            if parts[i + 1].strip()
        ]
    return [(1, text)]


def process_case(cid: str):
    with conn() as c:
        docs = [
            dict(x)
            for x in c.execute("select * from documents where case_id=?", (cid,))
        ]
    if not docs:
        raise HTTPException(400, "Upload at least one document before processing")
    # Provider is shown explicitly. Ollama mode calls local endpoint; unavailable/bad responses are reported.
    provider = os.getenv("AI_PROVIDER", "mock").lower()
    extracted = 0
    for d in docs:
        if not d["text"].strip():
            continue
        for page, text in text_pages(d["text"]):
            if provider == "ollama":
                try:
                    import requests

                    prompt = (
                        'Extract only explicit facts supported by this one source page. Never infer missing details or assess diagnosis, coverage, or eligibility. Return JSON object {"fields":[{"group":"Patient information","name":"Patient name","value":"...","evidence":"exact source excerpt","confidence":0.0}]}; use an empty fields array for absent facts. Source page text:\n'
                        + text[:7000]
                    )
                    endpoint = (
                        os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
                        + "/api/generate"
                    )
                    model = os.getenv("OLLAMA_MODEL", "qwen3:4b")
                    res = requests.post(
                        endpoint,
                        json={
                            "model": model,
                            "prompt": prompt,
                            "stream": False,
                            "format": "json",
                        },
                        timeout=60,
                    )
                    res.raise_for_status()
                    raw = res.json()["response"]
                    try:
                        payload = json.loads(raw)
                    except (ValueError, TypeError):
                        correction = (
                            "Return only a valid JSON object with a fields array matching the requested schema. Do not add markdown or unsupported facts. Repair this response:\n"
                            + str(raw)[:5000]
                        )
                        retry = requests.post(
                            endpoint,
                            json={
                                "model": model,
                                "prompt": correction,
                                "stream": False,
                                "format": "json",
                            },
                            timeout=60,
                        )
                        retry.raise_for_status()
                        payload = json.loads(retry.json()["response"])
                    entries = (
                        payload
                        if isinstance(payload, list)
                        else payload.get("fields", [])
                    )
                    if not isinstance(entries, list):
                        continue
                    for raw in entries:
                        try:
                            x = ExtractedField.model_validate(raw)
                        except Exception:
                            continue
                        if x.evidence.strip() and x.evidence in text:
                            add_field(
                                cid,
                                x.group,
                                x.name,
                                x.value,
                                d,
                                page,
                                x.evidence,
                                x.confidence,
                            )
                            extracted += 1
                except Exception as e:
                    log.info("Local Ollama extraction failed (%s)", type(e).__name__)
            else:
                for grp, name, value, evidence in mock_extract(text):
                    add_field(cid, grp, name, value, d, page, evidence, 0.92)
                    extracted += 1
    status = "Needs Review" if extracted else "Missing Information"
    with conn() as c:
        c.execute(
            "update cases set status=?,updated_at=? where id=?", (status, now(), cid)
        )
    return {
        "status": status,
        "provider": (
            "Ollama — local" if provider == "ollama" else "Deterministic demo provider"
        ),
        "fieldsAdded": extracted,
        "message": (
            "Extraction finished. Review every field against its evidence."
            if extracted
            else "No supported fields extracted. Check OCR/document text or local model availability."
        ),
    }


def process_case_safely(cid: str):
    try:
        process_case(cid)
    except Exception as e:
        log.error("Document processing failed (%s)", type(e).__name__)
        with conn() as c:
            c.execute(
                "update cases set status='Missing Information',updated_at=? where id=?",
                (now(), cid),
            )


@app.post("/api/cases/{cid}/process")
def process(cid: str, background: BackgroundTasks):
    r = getcase(cid)
    if r["status"] == "Processing":
        return {
            "status": "Processing",
            "provider": os.getenv("AI_PROVIDER", "mock"),
            "message": "This case is already being processed.",
        }
    with conn() as c:
        count = c.execute(
            "select count(*) n from documents where case_id=?", (cid,)
        ).fetchone()["n"]
    if not count:
        raise HTTPException(400, "Upload at least one document before processing")
    with conn() as c:
        c.execute(
            "update cases set status='Processing',updated_at=? where id=?", (now(), cid)
        )
    background.add_task(process_case_safely, cid)
    return {
        "status": "Processing",
        "provider": (
            "Ollama — local"
            if os.getenv("AI_PROVIDER", "mock").lower() == "ollama"
            else "Deterministic demo provider"
        ),
        "message": "Documents are being processed page by page.",
    }


@app.get("/api/cases/{cid}/extraction")
def extraction(cid: str):
    getcase(cid)
    return get_fields(cid)


@app.put("/api/cases/{cid}/review/{fid}")
def review(cid: str, fid: str, payload: ReviewIn):
    getcase(cid)
    with conn() as c:
        r = c.execute(
            "select * from fields where id=? and case_id=?", (fid, cid)
        ).fetchone()
        if not r:
            raise HTTPException(404, "Field not found")
        value = r["value"] if payload.value is None else payload.value
        origin = (
            "Manual entry"
            if r["origin"] == "Manual entry"
            else ("AI-extracted" if value == r["original"] else "Edited by staff")
        )
        c.execute(
            "update fields set value=?,review=?,origin=? where id=?",
            (value, payload.review, origin, fid),
        )
        return dict(c.execute("select * from fields where id=?", (fid,)).fetchone())


@app.post("/api/cases/{cid}/fields")
def manual_field(cid: str, body: dict[str, Any]):
    getcase(cid)
    if not body.get("name") or body.get("value") is None:
        raise HTTPException(400, "Field name and value are required")
    add_field(
        cid,
        body.get("group", "Patient information"),
        body["name"],
        str(body["value"]),
        review="Verified",
        origin="Manual entry",
    )
    return {"ok": True}


@app.get("/api/cases/{cid}/evidence/{fid}")
def evidence(cid: str, fid: str):
    getcase(cid)
    f = next((x for x in get_fields(cid) if x["id"] == fid), None)
    if not f:
        raise HTTPException(404, "Field not found")
    with conn() as c:
        d = (
            c.execute(
                "select stored,text from documents where id=? and case_id=?",
                (f["source_doc"], cid),
            ).fetchone()
            if f["source_doc"]
            else None
        )
    if not d:
        raise HTTPException(404, "No source document is linked to this field")
    return {
        "field": f,
        "sourceText": d["text"],
        "filename": f["source_name"],
        "page": f["page"],
        "evidence": f["evidence"],
        "downloadUrl": f'/api/cases/{cid}/documents/{f["source_doc"]}/file',
    }


@app.get("/api/cases/{cid}/documents/{did}/file")
def doc_file(cid: str, did: str):
    getcase(cid)
    with conn() as c:
        d = c.execute(
            "select * from documents where id=? and case_id=?", (did, cid)
        ).fetchone()
    if not d:
        raise HTTPException(404, "Document not found")
    return FileResponse(
        d["stored"],
        filename=d["filename"],
        media_type=mimetypes.guess_type(d["filename"])[0] or "application/octet-stream",
    )


REQUIRED = [
    "Admission notes",
    "Clinical notes",
    "Diagnostic reports",
    "Treatment plans",
    "Cost estimates",
    "Insurance identification",
]


def checklist(cid):
    docs = get_docs(cid)
    categories = {d["category"] for d in docs}
    aliases = {
        "Admission notes": ["Admission notes"],
        "Clinical notes": ["Clinical notes"],
        "Diagnostic reports": ["Diagnostic reports"],
        "Treatment plans": ["Treatment plans"],
        "Cost estimates": ["Cost estimates"],
        "Insurance identification": ["Insurance identification", "Insurance policy"],
    }
    return [
        {
            "requirement": r,
            "status": (
                "Available" if any(x in categories for x in aliases[r]) else "Missing"
            ),
            "note": "Demo policy checklist; presence does not imply coverage approval.",
        }
        for r in REQUIRED
    ]


def conflicts(cid):
    fields = get_fields(cid)
    groups = {}
    for f in fields:
        if f["review"] == "Rejected":
            continue
        if (
            f["name"].lower()
            in (
                "patient name",
                "age",
                "admission date",
                "provisional diagnosis",
                "estimated hospitalization cost",
            )
            and f["value"]
        ):
            groups.setdefault(f["name"], []).append(f)
    out = []
    for name, vals in groups.items():
        unique = {str(v["value"]).lower().strip() for v in vals}
        if len(unique) > 1:
            out.append(
                {
                    "field": name,
                    "values": [
                        {
                            "value": v["value"],
                            "source": v["source_name"],
                            "page": v["page"],
                            "fieldId": v["id"],
                        }
                        for v in vals
                    ],
                    "status": "Requires human review",
                }
            )
    return out


def review_summary(cid):
    fields = get_fields(cid)
    counts = {
        s: sum(f["review"] == s for f in fields)
        for s in ["Unreviewed", "Verified", "Edited", "Rejected", "Unable to Verify"]
    }
    counts["total"] = len(fields)
    counts["unresolvedConflicts"] = len(conflicts(cid))
    return counts


@app.get("/api/cases/{cid}/checklist")
def api_checklist(cid: str):
    getcase(cid)
    return checklist(cid)


@app.get("/api/cases/{cid}/conflicts")
def api_conflicts(cid: str):
    getcase(cid)
    return conflicts(cid)


@app.get("/api/cases/{cid}/review-summary")
def api_review_summary(cid: str):
    getcase(cid)
    return review_summary(cid)


@app.post("/api/cases/{cid}/ready")
def ready(cid: str, body: dict[str, str]):
    getcase(cid)
    summary = review_summary(cid)
    missing = any(x["status"] == "Missing" for x in checklist(cid))
    reason = body.get("overrideReason", "").strip()
    if (
        summary["Unreviewed"] or summary["unresolvedConflicts"] or missing
    ) and not reason:
        raise HTTPException(
            409,
            "Review all fields, address missing checklist items and conflicts, or provide a staff override reason",
        )
    with conn() as c:
        c.execute(
            "update cases set status='Ready for Submission',updated_at=?,review_notes=? where id=?",
            (now(), ("Staff override: " + reason) if reason else None, cid),
        )
    return {
        "status": "Ready for Submission",
        "overrideReason": body.get("overrideReason"),
    }


@app.post("/api/cases/{cid}/generate-packet")
def packet(cid: str):
    r = getcase(cid)
    data = case_json(r)
    fields = get_fields(cid)
    docs = get_docs(cid)
    checks = checklist(cid)
    confs = conflicts(cid)
    path = UPLOAD / f"{cid}-packet.pdf"

    def safe(value):
        return escape(str(value)).encode("latin-1", "replace").decode("latin-1")

    styles = getSampleStyleSheet()
    story = [
        Paragraph("PriorProof", styles["Title"]),
        Paragraph(
            "AI-Assisted Draft - Requires Hospital Staff Review", styles["Heading2"]
        ),
        Paragraph(
            f"Generated {now()} | Prototype; not insurer-approved", styles["Normal"]
        ),
        Spacer(1, 14),
        Paragraph("Case and patient details", styles["Heading2"]),
    ]
    rows = [
        ["Patient", data.get("patientName") or "Not found"],
        ["Patient ID", data.get("patientId") or "Not found"],
        [
            "Age / gender",
            f"{data.get('age') or 'Not found'} / {data.get('gender') or 'Not found'}",
        ],
        ["Hospital", data.get("hospitalName")],
        ["Admission date", data.get("admissionDate") or "Not found"],
        [
            "Insurer / policy",
            f"{data.get('insurer') or 'Not found'} / {data.get('policyNumber') or 'Not found'}",
        ],
        ["Reason", data.get("reason") or "Not found"],
        ["Diagnosis", data.get("diagnosis") or "Not found"],
        ["Planned treatment", data.get("treatment") or "Not found"],
        [
            "Estimated cost",
            (
                f"INR {data.get('estimatedCost'):,}"
                if data.get("estimatedCost")
                else "Not found"
            ),
        ],
    ]
    story.append(
        Table(
            [[safe(v) for v in row] for row in rows],
            colWidths=[140, 350],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eaf1f6")),
                    ("GRID", (0, 0), (-1, -1), 0.3, colors.lightgrey),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("PADDING", (0, 0), (-1, -1), 6),
                ]
            ),
        )
    )
    story += [
        Spacer(1, 12),
        Paragraph("Evidence-linked extracted fields", styles["Heading2"]),
    ]
    for f in fields:
        evidence = f"Source: {f['source_name'] or 'Manual entry'} · Page {f['page'] or '—'} · {f['review']} · {f['origin']}"
        story.append(
            Paragraph(
                f"<b>{safe(f['name'])}</b>: {safe(f['value'] or 'Not found')}<br/>{safe(evidence)}<br/>Evidence: {safe(f['evidence'] or 'No source evidence')}",
                styles["BodyText"],
            )
        )
        story.append(Spacer(1, 5))
    story += [Spacer(1, 8), Paragraph("Document checklist", styles["Heading2"])]
    for ck in checks:
        story.append(
            Paragraph(safe(f"{ck['requirement']}: {ck['status']}"), styles["BodyText"])
        )
    story += [
        Spacer(1, 8),
        Paragraph("Conflicts requiring attention", styles["Heading2"]),
    ]
    if confs:
        for cf in confs:
            story.append(
                Paragraph(
                    safe(
                        f"{cf['field']}: "
                        + " | ".join(
                            f"{x['value']} ({x['source']}, p.{x['page']})"
                            for x in cf["values"]
                        )
                    ),
                    styles["BodyText"],
                )
            )
    else:
        story.append(
            Paragraph("None detected in extracted fields.", styles["BodyText"])
        )
    if data.get("reviewNotes"):
        story += [
            Spacer(1, 8),
            Paragraph("Staff review note", styles["Heading2"]),
            Paragraph(safe(data["reviewNotes"]), styles["BodyText"]),
        ]
    story += [Spacer(1, 12), Paragraph("Uploaded documents", styles["Heading2"])]
    for d in docs:
        story.append(
            Paragraph(
                safe(f"{d['filename']} - {d['category']} - {d['pages']} page(s)"),
                styles["BodyText"],
            )
        )
    SimpleDocTemplate(
        str(path),
        pagesize=A4,
        rightMargin=46,
        leftMargin=46,
        topMargin=45,
        bottomMargin=45,
    ).build(story)
    return {
        "downloadUrl": f"/api/cases/{cid}/packet.pdf",
        "filename": "PriorProof_PreAuthorization_Draft.pdf",
    }


@app.get("/api/cases/{cid}/packet.pdf")
def get_packet(cid: str):
    getcase(cid)
    p = UPLOAD / f"{cid}-packet.pdf"
    if not p.exists():
        packet(cid)
    return FileResponse(
        p,
        filename="PriorProof_PreAuthorization_Draft.pdf",
        media_type="application/pdf",
    )


@app.post("/api/cases/{cid}/simulate-submission")
def submit(cid: str):
    r = getcase(cid)
    if r["status"] != "Ready for Submission":
        raise HTTPException(
            409, "Mark the reviewed case ready before simulating submission"
        )
    ref = "DEMO-" + uuid.uuid4().hex[:8].upper()
    value = {
        "status": "Simulated — not sent to an insurer",
        "reference": ref,
        "submittedAt": now(),
    }
    with conn() as c:
        c.execute(
            "update cases set status='Completed',submission=?,updated_at=? where id=?",
            (json.dumps(value), now(), cid),
        )
    return value

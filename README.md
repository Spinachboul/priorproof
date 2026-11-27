# PriorProof

PriorProof is a local-first prototype for preparing evidence-linked hospital cashless pre-authorization drafts. It helps hospital desk staff collect records, review extracted facts, spot missing checklist items and conflicting values, and export a packet for human review.

**This is a demonstration prototype.** It does not diagnose, determine coverage, approve claims, or connect to an insurer, TPA, or NHCX. The built-in patient, documents, insurer, and policy are fictional.

## Run locally

Requirements: Python 3.10+, Node.js 20+, npm. Optional for OCR: Tesseract installed on the laptop. Ollama is optional; the deterministic demo provider is the default.

1. Backend:

   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate
   python -m pip install -r requirements.txt
   cp .env.example .env
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

   First start seeds a fictional Aarav Sharma case and creates five synthetic supporting PDFs plus one fictional policy PDF. SQLite and uploaded files live under `backend/data/`.

2. Frontend, in another terminal at the project root:

   ```bash
   npm install
   npm run dev
   ```

   Visit <http://localhost:3000>. The API defaults to `http://localhost:8000`; set `NEXT_PUBLIC_API_URL` at build/dev time to change it.

## Local LLM

Install Ollama locally, then:

```bash
ollama pull qwen3:4b
```

Set `AI_PROVIDER=ollama`, `OLLAMA_BASE_URL=http://localhost:11434`, and `OLLAMA_MODEL=qwen3:4b` in `backend/.env`, then restart FastAPI. Ollama runs on the laptop and receives local document text only. The UI identifies the selected provider. If local inference fails, the app reports the failure and does not claim a model result. `AI_PROVIDER=mock` uses bounded deterministic pattern extraction and is plainly labelled as demo rules.

## Phone on the same Wi-Fi

Find the laptop's private LAN address (for example `192.168.1.20`), run both services bound to `0.0.0.0`, and open `http://192.168.1.20:3000` on the phone. Set `NEXT_PUBLIC_API_URL=http://192.168.1.20:8000` before starting/building the frontend and allow local-network firewall access. Keep the laptop and phone on a trusted network. Uploaded documents and API are not intended to be exposed to the public internet. Mobile file input supports camera capture where the browser offers it; preview before upload is available via the phone's system picker.

## Workflow

- Dashboard and all-cases list show case status.
- Create a case with basic patient, admission, insurance, and planned-care details.
- Upload PDF, PNG, JPG, or JPEG records (15 MB per file) and choose a category.
- Process documents. Text PDFs use PyMuPDF; images use Tesseract if available. OCR text with no field match remains unextracted rather than fabricated.
- Review, edit, verify, or reject extracted values and inspect source snippets, file, and page.
- Check the fictional policy checklist and conflicts. Readiness is blocked by unreviewed fields and conflicts unless staff records an override reason.
- Generate and download the AI-assisted draft PDF; simulate submission only after marking ready.

Image OCR requires the system `tesseract` binary as well as the Python packages. PDFs are processed page by page for text. The current Ollama adapter bounds input to 7,000 characters per document and validates evidence snippets against source text; a failed call yields no fields. Demo rule extraction is intentionally limited and does not imply language-model inference.

## Tests

From `backend/` with dependencies installed:

```bash
python3 -m unittest discover -s tests -v
```

The tests exercise synthetic evidence, checklist and conflicts, upload validation, review/readiness, packet PDF generation, and the simulated submission API. API docs are at <http://localhost:8000/docs> while running.

# PriorProof

PriorProof is a local-first prototype for preparing evidence-linked hospital cashless pre-authorization drafts. It helps hospital desk staff collect records, review extracted facts, resolve conflicting values, and export a PDF for human review. Use fictional data for the demo. Submission only creates a local simulation reference.

## One-time setup

Use Python 3.10+, Node.js 20+, npm, and OpenSSL. Install the system Tesseract executable and its English language data if you want OCR for photos and scanned PDF pages.

```bash
cd /home/mridul/Desktop/priorproof
npm ci
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Dependency installation needs internet access or a populated local package cache.

## Start offline on the laptop

The first start with an empty database seeds the fictional Aarav Sharma case. The terminal prints a fresh private key for each run. Use the existing SQLite database and upload directory under `backend/data/`, or set `DATABASE_PATH` and `UPLOAD_DIR` before starting to use separate demo storage.

```bash
# Terminal 1
cd /home/mridul/Desktop/priorproof/backend
export DEMO_ACCESS_KEY="$(openssl rand -hex 24)"
printf 'PriorProof demo key %s\n' "$DEMO_ACCESS_KEY"
AI_PROVIDER=mock .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```bash
# Terminal 2
cd /home/mridul/Desktop/priorproof
NEXT_PUBLIC_API_URL= NEXT_TELEMETRY_DISABLED=1 npm run build
NEXT_TELEMETRY_DISABLED=1 npm run start
```

Open [PriorProof on the laptop](http://127.0.0.1:3000) and select **Prepare a Cashless Request** to sign in with the key printed in terminal 1. Use `npm run dev` in place of the build and start commands when developing locally. For a persistent key or other settings, copy `backend/.env.example` to `backend/.env` if one does not already exist and replace the example key. Shell environment variables take precedence.

The demo uses one shared account. FastAPI checks the signed bearer session and case ownership before serving case data, source files, or packets. Sessions expire after 12 hours or at a backend restart. Use one API worker for the demo session and background processing state. SQLite and original documents are stored locally on disk.

## Run the phone demo over Wi-Fi

Find the laptop's private Wi-Fi address with `ip -4 -br addr`. Use the same address in both terminals. The example below uses `192.168.29.30`; substitute the current Wi-Fi address if it changes.

```bash
# Terminal 1
cd /home/mridul/Desktop/priorproof/backend
LAN_IP=192.168.29.30
export DEMO_ACCESS_KEY="$(openssl rand -hex 24)"
printf 'PriorProof demo key %s\n' "$DEMO_ACCESS_KEY"
AI_PROVIDER=mock CORS_ORIGINS="http://$LAN_IP:3000" \
  .venv/bin/python -m uvicorn app.main:app --host "$LAN_IP" --port 8000
```

```bash
# Terminal 2, after the build above
cd /home/mridul/Desktop/priorproof
LAN_IP=192.168.29.30
NEXT_TELEMETRY_DISABLED=1 ./node_modules/.bin/next start --hostname "$LAN_IP"
```

Open `http://192.168.29.30:3000` on the phone. Both devices need to be on the same trusted Wi-Fi with laptop TCP ports 3000 and 8000 reachable. The frontend uses the same hostname on port 8000 by default. `CORS_ORIGINS` lists exact browser origins. Access still requires a valid session. HTTP sends the demo key, session, and case data over the network without transport encryption. Keep this setup on trusted Wi-Fi and use only fictional records.

For different hosts or ports, set `NEXT_PUBLIC_API_URL` before building the frontend and include the exact frontend origin in `CORS_ORIGINS`. If the frontend uses HTTPS, serve the API over trusted HTTPS as well and set its URL explicitly. The phone workflow uses the operating system's file picker and a separate **Take a photo** input for browsers that support camera capture. It works without in-page camera APIs or a service worker. Use JPEG if the phone saves photos in HEIC. After generation, tap **Download PDF**, or use **Open PDF** and save it from the phone's PDF viewer.

## Demonstrate the four stages

1. **Create Case.** Enter a fictional patient and hospital. The seeded Aarav Sharma case also lets you start directly at review.
2. **Upload Documents.** Choose a PDF or take a picture of fictional text. For the deterministic demo, put `Patient: Mira Synthetic`, `Patient ID: DEMO-123`, and `Age: 34 years` on separate lines. Select the document category, upload it, and click **Process documents**. Uploads accept up to eight PDF, PNG, or JPEG files at a time, 15 MB per file by default. PDFs are limited to 40 pages and images to 20 megapixels. The document list shows when pages have no readable text.
3. **Review Evidence.** Open a field's source excerpt and page. Verify, edit, reject, or mark a field unable to verify. A single supported reviewed value can resolve competing unreviewed values. Distinct reviewed values keep the conflict open. A policy PDF leaves **Insurance identification** missing until an identification document is uploaded. To simulate submission with unresolved gaps, enter a staff override reason and mark the case ready.
4. **Generate Packet.** Generate the current PDF draft, then download or open it. It includes source excerpts, page references, staff edits, the checklist, conflicts, and any current override. A draft can be generated before the case is ready.

## Run with local Ollama

Install Ollama and download the model while online. With the local Ollama service running, use `ollama pull qwen3:4b` once. If the service is stopped, start it in a separate terminal with `ollama serve`. Then start the backend as above with these environment settings instead of `AI_PROVIDER=mock`.

```bash
AI_PROVIDER=ollama OLLAMA_BASE_URL=http://127.0.0.1:11434 OLLAMA_MODEL=qwen3:4b \
  .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Ollama must be on the same machine. For slower CPU-only runs, the per-request read timeout can be configured with `OLLAMA_TIMEOUT_SECONDS` (60 seconds by default, up to 180). The adapter considers the first 7,000 characters per page and sends only eligible labelled lines in a separate untrusted-data message. Pages without eligible lines skip the model request. The backend assigns each field group and checks structured proposals against the original source page. Unsupported suggestions are discarded. A failed request, malformed response, or response containing only unsupported suggestions keeps the previous results and marks processing failed. Demo rules can run independently with no model and only extract the explicit patterns they recognize.

## Three-minute guided demo

Use `AI_PROVIDER=mock` for a fast live demonstration beside the prepared extraction. Use only the fictional records.

1. Open **Explore Patient Journey** on the landing page. The steps show Aarav’s admission, the record gaps and what a reviewer checks. Select **Start Guided Demo** and sign in. This opens a separate prepared copy of the original fictional case. Existing demo decisions are reused if you return.
2. Open **Evidence graph**. Select **Admission date** under open issues and inspect its connected facts. Open the source evidence for each date. The graph also shows the missing insurance identification.
3. Follow **Smart next action** to Documents. Select **Upload fictional membership card** and **Process documents**. The membership card fixes the checklist gap. The live run preserves the prepared reviews.
4. In Review Evidence, compare 26 November in the admission note with 27 November in the treatment plan. Verify the admission note’s value and reject the conflicting value. The preparedness score updates to 100 on the default deterministic guided run. Select **Mark ready for submission**.
5. Continue to **Generate Packet**, generate the PDF, then download or open it. The workspace can also create a local simulated submission reference.
6. Open **Evaluation** for the measured runs and **Trust Centre** for the running controls and case activity. To reset just the prepared copy, delete the case with ID `DEMO-GUIDED-1024` in Trust Centre, then open **Start Guided Demo** again.

## Evidence, readiness and action rules

The Evidence Graph uses the authenticated case response. Solid lines show records or supported values. Dashed relationships show category matches, missing checklist support or competing values. The document labels come from upload categories. Reviewers can inspect source pages and excerpts from the graph or the review screen.

The [readiness rules](backend/app/readiness_rules.json) define the weights and required, essential and critical lists. Documents are scored against the number of required categories. Each remaining dimension uses the number of configured essential fields: present (including staff-entered case values), supported by a valid source quote, verified by staff, and present without an open conflict. An empty denominator earns zero points. Essential blockers gate readiness independently of the score. A staff override leaves the blockers visible and records an activity event. OCR and extraction actions, missing fields, unsupported proposals, conflicts and review actions link to the affected document or field.

Accepted machine values require an explicit label, a matching full value and an exact quote on the source page. Staff-edited values are labelled separately from machine evidence. This narrow validation can miss unstructured prose. It cannot establish the authenticity of a source document or recognize every deceptive instruction. The model receives no tools, credentials or submission capability.

## Reproduce the benchmark

```bash
cd /home/mridul/Desktop/priorproof
backend/.venv/bin/python evaluation/generate.py
backend/.venv/bin/python evaluation/run.py --provider mock
OLLAMA_BASE_URL=http://127.0.0.1:11434 backend/.venv/bin/python evaluation/run.py --provider ollama --model qwen3:4b
```

The default benchmark evaluates all ten cases through the application API using temporary SQLite and upload storage. Add `--case injection` (repeat `--case` for more fixture IDs) for a short run. The published JSON labels selected-case results. The dashboard loads the files in `public/evaluation/`. The downloadable archive groups originals under `documents/` and human-authored expectations under `expected/`. Actual fields and measurements are in provider-specific result JSON outside that archive. Use synthetic input exclusively.

- End-to-end latency measures upload, OCR, processing and detail retrieval per case. Model request latency measures Ollama adapter wall time for calls actually made, including any cold load or timeout.
- Field precision and recall compare unique canonical name/value pairs per case. F1 is their harmonic mean. Date normalization maps ISO and explicit month-name dates to ISO. Money formatting normalizes separators, supported currency symbols and decimal precision without conflating currencies. Names and ordinary text are case-folded with whitespace normalized.
- Citation correctness requires the expected document, page, fact and labelled quote, plus a quote found in the returned source page. Unsupported rate counts accepted rows with no such ground-truth citation. Separately reported excluded slots are unique document/page/field labels rejected by the validator.
- Missing and conflict detection compare sets of missing categories and unresolved field names per case. Classifications use micro-averaged counts. Undefined ratios are shown as a dash.
- OCR execution failures and pages with no readable text are counted separately. One scanned fixture deliberately has a blank page.
- The two providers and any selected-case runs have separate results. Label-aligned synthetic fixtures favor deterministic rules. Neither an outcome improvement nor real-world generalization has been measured.

To add a manual-versus-assisted comparison, place `workflow-timing.json` under `public/evaluation/` with a string `protocol` and arrays `manualSeconds` and `assistedSeconds` populated from recorded trials.

## Trust, activity and deletion

The Trust Centre reads the active backend configuration after authentication. Case activity stores pseudonymous actor/session IDs, object IDs, timestamps and outcomes. It excludes source text, extracted values and override reasons. Confirmed deletion removes the selected case data, upload artifacts and legacy packets managed by this application. Failed file cleanup is retried on startup or repeat deletion. The manual retention setting and limitations are described in the [draft policies](compliance/retention-policy.md).

## Run the checks

```bash
cd /home/mridul/Desktop/priorproof
./node_modules/.bin/tsc --noEmit --incremental false
NEXT_TELEMETRY_DISABLED=1 npm run build
cd backend
.venv/bin/python -m unittest discover -s tests -v
```

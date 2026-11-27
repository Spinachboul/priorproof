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

Open [PriorProof on the laptop](http://127.0.0.1:3000) and enter the key printed in terminal 1. Use `npm run dev` in place of the build and start commands when developing locally. For a persistent key or other settings, copy `backend/.env.example` to `backend/.env` if one does not already exist and replace the example key. Shell environment variables take precedence.

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

Ollama must be on the same machine. It receives up to 7,000 characters of local text per page. The adapter checks the structured result against allowed fields and source quotes. Unsupported suggestions are discarded. A failed request, malformed response, or response containing only unsupported suggestions keeps the previous results and marks processing failed. Demo rules can run independently with no model and only extract the explicit patterns they recognize.

## Run the checks

```bash
cd /home/mridul/Desktop/priorproof
./node_modules/.bin/tsc --noEmit --incremental false
NEXT_TELEMETRY_DISABLED=1 npm run build
cd backend
.venv/bin/python -m unittest discover -s tests -v
```

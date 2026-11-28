# PriorProof

PriorProof is a local-first hospital-side prototype for preparing cashless pre-authorization drafts and tracking authorization, billing and settlement evidence over a claim’s lifecycle. It helps hospital desk staff collect records, review extracted facts, resolve conflicting values, and export a PDF for human review. Use fictional data for the demo. Submission only creates a local simulation reference.

## Claim Integrity demonstration

The existing guided pre-authorization scenario remains available at `/workspace?case=guided`. **Aarav’s Complete Financial Journey** is a separate synthetic case at `/workspace?case=financial`. Restart the backend after updating, so the additive SQLite migration runs. Start both demo flags using the offline or Expo commands below. Use `AI_PROVIDER=mock AGENT_PLANNER=disabled` for a predictable run.

1. Open **Claim Integrity** from the Dashboard link or go to `http://localhost:3000/workspace?case=financial`. Confirm the next fictional document through admission, ₹85,000 initial estimate, ₹70,000 initial authorization and ₹1,15,000 revised estimate.
2. Inspect the ₹45,000 estimate-to-authorization difference. In **What-if**, enter a ₹90,000 revised authorization to see a hypothetical ₹25,000 difference. Then confirm the actual fictional enhancement request and revised authorization. Expand the original authorization to see its retained evidence.
3. Record the ₹1,15,000 final bill, fictional agreement, settlement advice and first ₹82,000 receipt. See the verified ₹15,000 adjustment, ₹1,00,000 allowable amount, ₹10,000 patient responsibility, ₹90,000 expected reimbursement and ₹8,000 potential payer variance.
4. Inspect the variance and its source pages in **Financial evidence graph**. Optional: start integrity review in **Agent Activity**. Simulate an extra ₹8,000 payment. The recorded receipts stay at ₹82,000.
5. Confirm the actual fictional additional payment, revised settlement advice and administrative resolution. The recorded total is ₹90,000 and the payment variance clears. The ₹10,000 patient responsibility remains unchanged. Resume an active integrity agent run only after confirming an updated source.
6. In **Outcomes**, record the additional payment using its confirmation, then the administrative resolution using its resolution evidence. The synthetic workflow shows a candidate follow-up rule requiring staff review.
7. Review the minimized **Patient financial summary**, confirm staff review, and download the three PDFs. **Reset financial journey** deletes only this fictional case and reopens it in its initial state, subject to the existing retention restrictions.

Financial records require a confirmed case source page and revision. The **Financial claim evidence** category is available in web and Expo. On an ordinary case, use **Case privacy** to confirm financial processing, upload a structured source and record it in Claim Integrity. Expo can show the minimized summary and resume financial review tasks after verification in the web workspace.

Reproduce the deterministic benchmark from the repository root:

```bash
backend/.venv/bin/python evaluation/run_integrity.py --output public/evaluation/results-integrity.json
```

The deterministic benchmark is separate from the existing mock/Ollama extraction runs and uses supplied evidence fixtures. See the [architecture, document format and API](docs/claim-integrity-architecture.md), [commercial shadow-mode pilot](docs/claim-integrity-commercial-pilot.md) and [development report](docs/claim-integrity-development-report.md). Named payer rules are fictional, with generic verification as the fallback. A synthetic Northstar case can propose, approve and pin an applicable rule version in Authorization drift. Production identity, security, tariff modeling and interoperability require further work and organizational approval.

## Public website

The educational pages work without a session. The public navigation leads to:

- `/` and `/journey` for the fictional Aarav Sharma story.
- `/product` for the interactive preparation workflow, published benchmark summary, guided demo and developer setup.
- `/industry` for sourced India insurance figures, the cashless workflow and three documented examples. The cashless settlement estimate is labelled as derived. The Bengaluru example is based on the original newspaper report.
- `/solutions` and `/market` for prospective stakeholder groups and links to six vendors’ own product descriptions.
- `/business-value` for staff capacity and annual recurring revenue scenarios, the proposed roadmap and a downloadable pilot enquiry brief. The calculators use hypothetical inputs and require pilot validation.
- `/trust` and `/evaluation` for privacy controls, remaining regulatory readiness work and separate published Ollama and mock results.

**Experience PriorProof** opens a new fictional case. **Start Guided Demo** opens the prepared copy. Both go to the existing `/workspace`. Case records, original documents, case audit activity and generated packets require a valid bearer session and case authorization. The evaluation downloads are published synthetic fixtures. Public content and charts use local assets after installation. External source links require internet access.

## One-time setup

From the repository root, use Python 3.10+, Node.js 22 LTS (22.13 or later), npm, and OpenSSL. Install the system Tesseract executable and its English language data if you want OCR for photos and scanned PDF pages.

```bash
npm ci
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Dependency installation needs internet access or a populated local package cache.

## Start offline on the laptop

Start each terminal at the repository root. The first start with an empty database seeds the fictional Aarav Sharma case. The commands below use dedicated fictional demo storage and enable automatic website sign-in.

```bash
# Terminal 1
cd backend
DATABASE_PATH=./data/phase3-demo.db UPLOAD_DIR=./data/phase3-uploads \
  DEMO_LOGIN_ENABLED=1 AI_PROVIDER=mock \
  .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```bash
# Terminal 2
NEXT_PUBLIC_API_URL= NEXT_TELEMETRY_DISABLED=1 npm run build:demo
NEXT_TELEMETRY_DISABLED=1 npm run start
```

Open [PriorProof on the laptop](http://127.0.0.1:3000) and select **Experience PriorProof** or choose **Prepare a Cashless Request** on the Product page. The website signs in automatically, including when you open `/workspace` directly or select **Start Guided Demo**. Use `npm run dev:demo` in place of the build and start commands when developing locally.

The demo scripts set `NEXT_PUBLIC_DEMO_MODE=1`. Production builds embed this value at build time. Use both flags only with fictional data and dedicated demo storage. To use manual access-key sign-in, leave `NEXT_PUBLIC_DEMO_MODE` unset, use `npm run dev` or `npm run build`, and start the backend with `DEMO_LOGIN_ENABLED=0` and a private `DEMO_ACCESS_KEY`. Shell environment variables take precedence over `backend/.env`.

The demo uses one shared account. FastAPI checks the signed bearer session and case ownership before serving case data, source files, or packets. Sessions expire after 12 hours or at a backend restart. Use one API worker for the demo session and background processing state. SQLite and original documents are stored locally on disk.

## Run the phone demo over Wi-Fi

Start each terminal at the repository root. In each terminal, look up your laptop’s LAN address:

```bash
LAN_IP=$(ip -4 route get 1.1.1.1 | awk '{for(i=1;i<=NF;i++) if($i=="src") {print $(i+1);exit}}')
printf '%s\n' "$LAN_IP"
```

Check the address against `ip -4 -br addr`. If the default route points to a VPN or a different interface, set `LAN_IP` to the address shown for the Wi-Fi interface in each terminal.

```bash
# Terminal 1
cd backend
DATABASE_PATH=./data/phase3-demo.db UPLOAD_DIR=./data/phase3-uploads \
  DEMO_LOGIN_ENABLED=1 AI_PROVIDER=mock CORS_ORIGINS="http://$LAN_IP:3000" \
  .venv/bin/python -m uvicorn app.main:app --host "$LAN_IP" --port 8000
```

```bash
# Terminal 2, at the repository root
NEXT_PUBLIC_API_URL="http://$LAN_IP:8000" NEXT_TELEMETRY_DISABLED=1 npm run build:demo
NEXT_TELEMETRY_DISABLED=1 ./node_modules/.bin/next start --hostname "$LAN_IP" --port 3000
```

Open `http://<LAN_IP>:8000/api/health` in the phone browser first, substituting the address you found. After it returns JSON, open `http://<LAN_IP>:3000` on the phone. Both devices need to be on the same trusted Wi-Fi with laptop TCP ports 3000 and 8000 reachable. The frontend uses the same hostname on port 8000 by default. `CORS_ORIGINS` lists exact browser origins. Access still requires a valid session. HTTP sends credentials, sessions and case data over the network without transport encryption. Keep this setup on trusted Wi-Fi and use only fictional records.

For different hosts or ports, set `NEXT_PUBLIC_API_URL` before building the frontend and include the exact frontend origin in `CORS_ORIGINS`. If the frontend uses HTTPS, serve the API over trusted HTTPS as well and set its URL explicitly. The phone workflow uses the operating system's file picker and a separate **Take a photo** input for browsers that support camera capture. It works without in-page camera APIs or a service worker. Use JPEG if the phone saves photos in HEIC. After generation, tap **Download PDF**, or use **Open PDF** and save it from the phone's PDF viewer.

## Run the Phase 3 Expo app

Use Node.js 22 LTS (22.13 or later) for the mobile tools. Install the web and backend dependencies from the one-time setup above, then install the mobile package.

```bash
npm ci
npm ci --prefix mobile
cd backend
test -x .venv/bin/python || python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Set the LAN address in each terminal as described above. Install [Expo Go for SDK 58](https://expo.dev/go) on the phone. Both devices must be able to reach the laptop over Wi-Fi. Expo's default Metro port is 8081. The example uses a separate SQLite database so the guided demo can start from its original state.

```bash
# Terminal 1, from the repository root
cd backend
DATABASE_PATH=./data/phase3-demo.db UPLOAD_DIR=./data/phase3-uploads \
  AI_PROVIDER=mock AGENT_PLANNER=disabled DEMO_LOGIN_ENABLED=1 \
  CORS_ORIGINS="http://$LAN_IP:3000" \
  .venv/bin/python -m uvicorn app.main:app --host "$LAN_IP" --port 8000
```

```bash
# Terminal 2, from the repository root
NEXT_PUBLIC_API_URL="http://$LAN_IP:8000" NEXT_TELEMETRY_DISABLED=1 npm run build:demo
NEXT_TELEMETRY_DISABLED=1 ./node_modules/.bin/next start --hostname "$LAN_IP" --port 3000
```

```bash
# Terminal 3, from the repository root
cd mobile
EXPO_PUBLIC_API_URL="http://$LAN_IP:8000" npx expo start --go --lan
```

Set `LAN_IP` in all three terminals using the lookup above. Open `http://<LAN_IP>:8000/api/health` on the phone and check for JSON before starting Expo. If the page fails, check the API bind address, firewall and whether Wi-Fi isolates clients. Open the Expo development QR with Expo Go (or the system camera on iOS), confirm that the backend URL matches the website's API, and tap **Sign in as demo user**. This development QR opens the app. The case QR displayed on the website opens a specific case after sign-in and owner verification. It contains only the opaque case UUID.

Both clients use the same backend, database and demo account. Both submit `user1` and `abc123` to the existing login endpoint and receive a bearer session. The website renews an expired demo session automatically. Expo's standalone fallback suggests port 8001 if no API URL is configured. Use port 8000 for this combined setup.

LAN HTTP transmits the demo key, bearer sessions and records without encryption. Use only fictional records on trusted Wi-Fi. Real deployments require HTTPS and an appropriate staff identity and access model. The existing demo uses one shared account and one backend worker. Any staff using that account share its case access. Mobile stores the session in SecureStore and keeps case data in memory. Upload and PDF export cache copies are removed after use during normal navigation. Files saved or sent through the system share sheet are managed by the receiving app. For a native build outside Expo Go, use HTTPS, or configure platform-specific private LAN transport for a fictional demo.

### Cross-device demo

1. On the laptop, open `http://<LAN_IP>:3000/workspace?case=guided`. After automatic sign-in, select **Start preparation** in **Agent Activity**. The agent pauses on **Insurance identification**.
2. On the website, select **Show case QR**. In the signed-in Expo app, tap **Scan case QR** and scan it. The **Aarav Sharma** case is also available on the mobile home screen if the camera is unavailable.
3. Download the existing fictional membership card to the phone from `http://<LAN_IP>:3000/evaluation/aarav-membership.pdf`. In the case's **Agent tasks**, open **Insurance identification**, choose **Capture supporting document**, then **Choose PDF files**. Keep the preselected **Insurance identification** category and upload. A clear camera photo of the same fictional card also works when local OCR is available.
4. Return to **Agent tasks** and select **Confirm update and resume** for the document. The same run analyzes the new case revision. The website polls approximately every four seconds and shows the checklist change and the updated readiness score. The admission-date conflict remains open for staff.
5. Open the admission-date conflict and its two sources. Verify the **26 November 2026** admission-note value and reject the **27 November 2026** treatment-plan value. Return to the agent, confirm the update and resume. When the readiness checks pass, select **Approve draft preparation**. Open **Draft packet** on mobile to page through the preview or use **Save or share PDF**. The web panel also offers the draft download.

The demo flow can be reset from the Trust Centre by deleting the prepared copy with patient ID `DEMO-GUIDED-1024` and reopening the guided workspace. Runs and case data persist in the demo SQLite file. After an API restart, the website renews its demo session and Expo prompts for demo sign-in again.

### Agent architecture and API

One LangGraph workflow inspects the case, checks document requirements, runs existing extraction when the document set needs analysis, detects conflicts, checks field evidence, computes readiness and requests staff input. SQLite persists checkpoints, tool results by reference, and revision-bound confirmations. Resume rechecks the latest authorized case. Extraction commits compare the expected revision and record the result atomically to prevent repeating a committed extraction after a restart. The graph bounds each activation to a 45-second cooperative execution budget and each run to 36 tool steps. The current implementation uses a single API worker.

By default, the agent can ask loopback Ollama to prioritize among multiple eligible staff task types. Only task kinds, option numbers and counts enter the planner. Known prerequisites use deterministic rules. Missing, disabled or invalid planner responses fall back to deterministic selection and are labelled in the trace. To use the local planner, omit `AGENT_PLANNER=disabled` and configure `OLLAMA_MODEL` and `OLLAMA_BASE_URL` as described below. `AI_PROVIDER` controls the existing extraction service independently.

Staff record document and evidence changes through the existing case endpoints. Human-input confirmation records a task ID, a case revision and explicit confirmation. Draft generation requires current staff approval and a readiness assessment without blockers. The agent's draft PDF route rejects stale revisions. Insurance decisions and the separate existing simulation action stay outside the agent tool allowlist.

All routes below require an existing bearer session and case ownership. Agent paths are relative to `/api/cases/{caseId}/agent/runs`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/` | Start, or return the current active run |
| GET | `/latest` | Latest run for this case, or null |
| GET | `/{runId}` | Status, current revision and observable actions |
| GET | `/{runId}/trace` | Completed tool actions and selection modes |
| GET | `/{runId}/tasks` | Outstanding staff tasks |
| POST | `/{runId}/input` | Confirm a task with `task_id`, `revision` and `confirmed: true` |
| POST | `/{runId}/resume` | Resume an interrupted or recoverable run |
| POST | `/{runId}/cancel` | Cancel a run |

The existing document upload accepts an optional multipart UUID `upload_id` for safe retries. Field review and staff entry accept an optional `expectedRevision` for stale-write protection. The mobile PDF viewer uses `GET /api/cases/{caseId}/packet-preview?revision=…&page=1` and the approved download uses the existing `packet.pdf` endpoint with a revision query.

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

## Final privacy demonstration

Start the fictional stack using the offline or Expo commands above. Restart the API after updating so it creates the privacy tables and backfills the seeded Aarav processing record.

1. Open **Start Guided Demo** from the Patient journey. In **Case privacy and confidentiality**, read the processing purpose and notice version. For a new case, the case form records selected categories, recipients and basis. Confirming the form records a staff action. Separate evidence is required for actual consent or a legal basis.
2. Open **Documents** and select **Upload fictional privacy record**. The same PDF is available at `/evaluation/aarav-privacy-record.pdf` for an upload from Expo. Use **Other supporting documents** so the membership-card requirement remains available for the existing cross-device demo.
3. Expand **Case privacy and confidentiality** and select the supporting document. Show the masked text preview and classifications. Open the authorized original separately when needed. Record **Mark privacy reviewed** or **Flag privacy follow-up**. The preview masks detectable patterns in extracted text and does not redact the PDF.
4. Continue **Agent Activity**, upload the existing fictional membership card from Expo, resolve the admission-date conflict and approve a draft. Open **Trust Centre** to see the case’s audit activity, privacy and retention controls, and the DPDP **Regulatory Readiness** table. Download the JSON privacy and processing summary from the case privacy panel.
5. Optionally record an access request or grievance and update its handling status. Set a future retention review date or legal hold to demonstrate that the server blocks deletion. A recorded request does not automatically erase data.

Detector classifications and additional contextual identifiers are configured in [privacy_rules.json](backend/app/privacy_rules.json). Screening does not independently validate Aadhaar, PAN, bank details or document authenticity. The summary omits raw identifiers, source text and case patient fields. Only authorized staff should access originals, clinical packets and source evidence. See the [privacy notice](compliance/privacy-notice.md), [inventory](compliance/data-inventory.md), [retention policy](compliance/retention-policy.md) and [official DPDP reference mapping](compliance/regulatory-readiness.md).

### Verification on 28 November 2026

- The backend suite passed all 39 tests, including masking, false positives, input minimization, original-file preservation, authorization, audit and deletion.
- Web and mobile TypeScript checks and the Next.js production build passed.
- A headless browser verified automatic guided sign-in, processing-purpose capture for new cases, the synthetic upload, a masked preview, staff privacy review, the summary download and Trust Centre. A second authenticated HTTP client uploaded the membership record and the browser resumed the agent.
- This pass used deterministic extraction. Live Ollama inference and the workflow on physical Expo devices remain unverified for this phase. The preview masks text only. Production security and legal controls require separate organizational assessment.

## Run the checks

Start each block from the repository root.

```bash
npm run test:roi
./node_modules/.bin/tsc --noEmit --incremental false
NEXT_TELEMETRY_DISABLED=1 npm run build
cd backend
.venv/bin/python -m unittest discover -s tests -v
```

```bash
cd mobile
npm run typecheck
npx expo-doctor@latest
npx expo export --platform all
```

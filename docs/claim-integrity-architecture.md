# Claim Integrity architecture

PriorProof is a fictional, hospital-side verification prototype. The existing application remains a Next.js workspace, Expo capture app and one FastAPI service backed by local SQLite and protected files.

## Data and execution

1. An authorized staff member opens **Claim Integrity** after signing into a case. Expo can upload financial evidence using the existing case QR, document picker or camera.
2. Staff review the source and submit its case document ID, page, event type and current case revision. Structured fields are accepted only from unique labelled lines on that page. The original upload remains in the existing document store.
3. The transaction checks ownership, processing confirmation, order, stage prerequisites, source support, current revision, supersession and idempotency. It appends the event and writes a metadata-only audit entry. Payments use a case-scoped deduplication digest. Refunds and reversals link to an earlier receipt and cannot exceed its value.
4. Each read reconstructs source support from the current protected document. Explicit, supported supersession determines the current record. Competing versions with different values block the affected calculation. Removed evidence makes dependent amounts unavailable until staff restore valid evidence. Cases with no lifecycle events continue using the original preparation flow.
5. The engine produces deterministic amount lineage and categorized findings. Inputs link to their underlying document pages. The claim “digital twin” is this versioned administrative state. Formal causal reasoning and clinical decision support remain future research.
6. The Claim Integrity tab offers three temporary what-if comparisons. The simulator has no database write path. Finance staff must verify a separate source before posting an actual update.
7. The existing LangGraph executor supports a separate integrity mode with the same durable checkpoints, tool allowlist, deadlines and revision-bound staff pause. It inspects lifecycle evidence, reconciles the amounts, requests an administrative update and prepares the case for staff report review. It leaves payments, reports and financial facts under direct staff control.
8. PDF export requires a staff-confirmed current revision. PDFs are rendered in memory using ReportLab and use the existing bearer and case checks. Patient summaries omit the patient name, private payment references and underlying agreement excerpts. The compact Expo summary omits original documents and excerpts.

## Financial rules

All amounts are integer INR paise. The first rule requires an evidence-backed bill, contractual adjustment, allowable amount, patient responsibility and an explicit declaration of the net responsibility method. The second supports an explicit cap when a verified policy limit is present. Unknown rules produce unknown reimbursement. A revised bill that conflicts with the documented terms invalidates the current reimbursement calculation and patient responsibility display. Recorded authorizations are distinct from billing and settlement. Case-scoped payment investigation snapshots preserve expected and received amounts, resolution status and evidence links across a verified correction. Unsupported historical entries withhold their amounts.

Payment comparisons use confirmed receipts net of verified reversals and refunds. A partial remittance or a recorded amount above confirmed receipts can produce outstanding payment on the available evidence. A remaining difference against recorded final settlement can be flagged for investigation. This applies to both positive and negative differences. Documented deductions require contractual verification. The trial never assigns an insurer variance to the patient.

## Data and API

The additive SQLite migration creates `integrity_events`, `integrity_reviews`, `integrity_demo_cases` `integrity_outcomes`, `integrity_payment_investigations`, `integrity_profile_versions` and `integrity_profile_pins`. The existing `agent_runs` table gains a defaulted `mode` column. No source PDF or extracted text is duplicated in the financial tables. The event record retains the document ID, page, normalized values and staff/revision metadata. Excerpts are extracted from the existing case document. Existing case deletion removes financial records, linked agent checkpoints and app-managed files, subject to retention review dates and holds. Externally exported copies and backups have separate retention.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/demo/aarav-financial` | Open the isolated fictional journey when demo login is enabled |
| `GET /api/cases/{id}/integrity` | Timeline, findings, amount lineage, profile and simulated outcomes |
| `GET /api/cases/{id}/integrity/summary` | Minimized staff summary for Expo |
| `POST /api/cases/{id}/integrity/events` | Confirm a same-case uploaded source page |
| `POST /api/cases/{id}/integrity/simulate` | Compare one hypothetical change |
| `POST /api/cases/{id}/integrity/review` | Confirm a report revision |
| `POST /api/cases/{id}/integrity/outcomes` | Record case-scoped simulated feedback |
| `POST /api/cases/{id}/integrity/demo-step` | Confirm the next fictional PDF and event |
| `DELETE /api/cases/{id}/integrity/demo` | Reset only the marked financial demo case |
| `GET /api/cases/{id}/integrity/{report}.pdf?revision=...` | Export a reviewed integrity, investigation or patient report |
| `POST /api/cases/{id}/agent/runs?mode=integrity` | Start the existing LangGraph runner in integrity mode |

`GET .../agent/runs/latest?mode=integrity` queries that mode. Run-specific updates keep the existing API. The integrity JSON is a machine-readable findings export. On synthetic Northstar cases with staff processing confirmation, `POST .../profile/versions` proposes a threshold and effective window, `POST .../profile/versions/{version}/approve` approves it, and `PUT .../profile` pins an applicable approved version to the case. Approval leaves the prior pin in effect until a separately confirmed case update. Access uses the existing shared synthetic identity, so every holder of that identity can access its cases. Real deployments require individual identity and role controls.

### Structured source contract

Upload a PDF or supported image under **Financial claim evidence**, then confirm the relevant source page. Set case processing purpose and **Financial claim records** in Case privacy first. Example, as text on one page:

```text
Record type: settlement
Effective date: 2026-12-05
Insurer settlement amount: INR 82000.00
Settlement status: final
```

The `events` API accepts `eventKey` (UUID), `expectedRevision`, `staffConfirmed` (boolean true), `kind`, `documentId` (UUID), and `page`. For a revision, supply `supersedes` with the prior event ID. For a reversal or refund, use `related` with the original receipt event ID. Payment sources include a unique `Transaction reference`. Agreement pages supply `Contractual adjustment`, `Contractually allowable amount`, `Patient responsibility` and an explicit `Reimbursement rule`. The full set of record kinds and amount labels is defined in `backend/app/financial_reconciliation.py`. Out-of-order historical backfills need an explicit reviewed policy and are deferred.

## Governance and integration

The guided Northstar profile keeps its fixed demo version. Other synthetic Northstar cases can propose and approve a threshold revision, inspect history and explicitly pin an applicable version. Generic requirements prompt staff to verify governing documents. Live payer catalog publication, CSV ingestion, automated remittance matching, multi-hospital dashboards and real outcome pooling require separate designs. Simulated outcomes offer candidate checks requiring staff review. They do not alter the payer profile or train a model.

Future integrations can exchange versioned events and evidence references with hospital systems, subject to field mapping, consent/authorization, purpose and retention controls. HL7 FHIR mapping, NHCX onboarding, approved production endpoints, managed security, tariff-specific rules and verified insurer agreements are future work. No new infrastructure is needed for the fictional demo.

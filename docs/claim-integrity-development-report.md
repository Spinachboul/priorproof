# Claim Integrity development report

## Implementation by priority

| Priority | Delivered |
| --- | --- |
| P0 | Case lifecycle, versioned estimates and authorizations, authorization drift, paise-exact reconciliation, source-backed findings, separate patient responsibility, isolated simulations, resettable Aarav journey, case access checks and deletion integration. |
| P1 | Selectable financial evidence and calculation lineage, fictional payer profile version approval and pinning, integrity mode in the original LangGraph runner, patient and staff reports, Expo capture/summary/tasks, and public product and market positioning. |
| P2 | Case-scoped simulated outcomes, candidate checklist improvements, payment investigation history with PDF export, commercial feasibility calculator, and a separate synthetic benchmark. |
| P3 | Future pilot and production requirements are documented. |

The original pre-authorization case, workflow, review screens, evidence graph, guarded exports and benchmark results retain their existing paths. New synthetic records are kept in a separate financial case. Only the marked financial case is eligible for its reset action.

## Files and migrations

- New backend modules: `backend/app/claim_integrity.py`, `financial_reconciliation.py`, `integrity_demo.py`, `integrity_reports.py`, `outcome_intelligence.py`, `payer_profiles.py` and `synthetic_payer_profiles.json`.
- New web and mobile entry points: `app/claim-integrity.tsx` and `mobile/app/case/[id]/financial.tsx`.
- New verification artifacts: `backend/tests/test_integrity.py`, `evaluation/claim_integrity_cases.json`, `evaluation/run_integrity.py` and `public/evaluation/results-integrity.json`.
- New documentation: this report, [architecture and API](claim-integrity-architecture.md), and the [commercial pilot plan](claim-integrity-commercial-pilot.md).
- Updated backend registration, privacy and deletion in `backend/app/main.py`, `backend/app/privacy.py` and `backend/app/privacy_rules.json`. Extended the bounded graph in `backend/app/agent.py`.
- Updated the workspace, shared agent activity, privacy form, public landing, product, market, evaluation and business pages, styles, ROI tests, Trust Centre readiness copy and README. Updated mobile case routes and cached queries for the new document category, summary and task mode.
- Additive SQLite tables hold case events, review confirmations, the demo marker, simulated outcomes, payment investigation snapshots, profile versions and case pins. Existing `agent_runs` gains one defaulted mode column. See the [architecture and API](claim-integrity-architecture.md) for table and endpoint names, schemas and access behavior.

## Tests executed

- Baseline backend suite before changes: 39 passed.
- Final backend suite: 50 passed. Coverage includes full fixture progression, stale staff decisions, exact money, cap rules, profile version isolation, duplicate receipts, document removal, cross-case access, agent checkpoint resumption, report privacy, original case preservation and deletion.
- Next.js production build and web and mobile TypeScript checks passed. Six ROI and commercial calculation tests passed.
- An isolated browser passed the full 13-document financial journey, both what-if comparisons, agent pause/resume, source and calculation navigation, historical variance, outcome feedback and authenticated PDF download. It also opened the original guided case and verified the financial view at 390 pixels.
- During development, two event API tests exposed a mismatched SQLite insert placeholder count, which was corrected. A later browser assertion matched both current and historical reconciliation labels. After scoping it to the current result and separately checking history, the full browser walkthrough passed.
- Expo Doctor passed all 20 checks. Offline Expo export built Android and iOS bundles. A physical phone, device camera and LAN pairing were outside this run.
- The existing mock benchmark reran all 10 cases. Field, missing-document, conflict, citation and processing-failure counts matched the published run. The existing benchmark artifacts were preserved. Live Ollama inference was outside this run.

### Deterministic benchmark

The recorded run matched **16/16 scenarios** and **28/28 expected values**, including **11/11 expected unknowns**. The benchmark found **2/2 authorization drift fixtures** and **2/2 payment variance fixtures** with zero false positives on these fixtures. There were **98/98 supporting event reference checks**. Mean calculation time was **0.0108 ms** for this recorded run. These fixtures supply verified inputs directly. The benchmark does not measure document extraction, case authorization or outcomes in hospitals. Individual expected and observed amounts and remaining limitations are in [results-integrity.json](../public/evaluation/results-integrity.json).

## Demonstration

Start the backend and web app with explicit synthetic demo mode and use the [README walkthrough](../README.md#claim-integrity-demonstration). Show the ₹45,000 difference, run the ₹90,000 authorization simulation, and post the separate fictional revised authorization. Continue to the final bill and ₹82,000 receipt. Show the ₹8,000 variance, the supporting records and ₹10,000 patient responsibility. Compare the additional-payment what-if, then confirm the actual fictional ₹8,000 receipt and amended settlement. Inspect the retained investigation history and export the three PDFs after staff confirmation.

## Limits and next phase

Available payer rule profiles are fictional. The named profile supports review, version approval and explicit case pinning for a conditional enhancement check. Real insurer rules and bespoke tariffs require authoritative, versioned terms and validation. The regular import path accepts a confirmed, structured source page per event. Bulk CSV/remittance ingestion and policy-aware backfills remain future work. Outcomes and rule suggestions are synthetic and case scoped. A cross-case management dashboard and formal persistent rule-suggestion adjudication remain future work.

The next phase is a controlled shadow-mode pilot preparation: establish individual identities and appropriate access roles, define the minimum evidence contract with a hospital, compare verified findings with existing software, measure false alerts, and check data-handling arrangements before using any live records. The [commercial pilot plan](claim-integrity-commercial-pilot.md) defines the evaluation and discovery questions.

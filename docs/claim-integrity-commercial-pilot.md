# Commercial feasibility and shadow-mode pilot

**Validation question.** Does PriorProof detect and help resolve meaningful financial or administrative discrepancies that the hospital’s existing systems do not already handle efficiently?

## Evidence available today

- Published accounts describe document collection, clarification and authorization delays. See the [Maharashtra PM-JAY and MJPJAY study](https://doi.org/10.1186/s12913-025-12450-0) and [IRDAI annual report](https://lifeinscouncil.org/component/IRDAI%20Annual%20Report%202024-25.pdf) for their specific claims and periods.
- Vendors describe related capabilities in authorization, claims, reconciliation and denial prevention. The public Market Landscape links to [HRCM](https://www.hrcm.in/), [Caladrius Health](https://caladriushealth.ai/platform/brief/), [Optum](https://business.optum.com/en/operations-technology/revenue-cycle-management/patient-access/digital-auth-complete.html), [R1’s Humata announcement](https://www.r1rcm.com/newsroom/r1-takes-aim-at-healthcares-fragmented-revenue-cycle-with-six-connected-phare-os-modules) and the other reviewed vendors. The descriptions are vendor disclosures and performance requires independent verification.
- Apollo Hospitals Enterprise identifies trade receivables and current investments as contributors to a change in its current ratio. Its consolidated disclosure leaves individual payer variances for separate verification. [FY 2024–25 report, management discussion §7.2](https://www.apollohospitals.com/sites/default/files/2025-08/annual-report_2025--1---1-.pdf).
- PriorProof’s hypothesis is that a local hospital-side verification layer combining a temporal audit trail, evidence-linked arithmetic, what-if analysis and privacy-conscious patient explanations adds value alongside existing systems.
- The [deterministic benchmark](../public/evaluation/results-integrity.json) is a synthetic correctness measurement of calculations. The original [mock](../public/evaluation/results-mock.json) and [Ollama](../public/evaluation/results-ollama.json) files measure document-processing behavior separately. Hospital recovery, time savings, willingness to pay and product adoption remain unvalidated.

## Study design

1. Agree on baseline workflow, comparison period, error taxonomy, sample, outcome definitions and review burden before the trial. Begin with synthetic cases. Live shadow mode requires hospital authorization, legal agreements, privacy assessment, secure deployment and validated processing arrangements.
2. Hospital staff continue their normal workflow. A separate authorized reviewer uses PriorProof to document findings on the same approved cases. Compare each finding against evidence, the outcome and what existing systems already surfaced. Retain documented differences and independent review decisions.
3. Observe preparation time including review and rework, incremental administrative effort, false alerts, avoidable clarification, authorization discrepancies, false negatives, implementation effort and staff adoption. Measure staff understanding and the accuracy of patient-facing explanations.
4. Maintain separate ledgers for outstanding payments, flagged variances, verified recoverable amounts and actual additional receipts. Count each case and receipt once, reconcile reversals and compare with the baseline. Report projection and real outcomes separately.
5. Record integration staffing, equipment, local inference, maintenance and training costs. Recovered staff time is capacity. Actual receipts and avoided losses are distinct metrics. Validate definitions with the hospital’s finance team before using them for business decisions.
6. Review samples without exposing clinical details in commercial meetings. Review privacy and confidentiality incidents and agree when to stop the trial.

## Customer discovery

Interview the CFO and revenue cycle lead about existing reconciliations, escalation process, decision thresholds and documented losses. Ask insurance desk staff to walk a recent difficult case and estimate review burden. Interview IT about data sources, identifiers, deployment and integration. Ask TPA operations how remittance and clarification records are handled. Review contracts, access, retention and data minimization with privacy and compliance staff. Compare what interviewees report against operational examples and confirm each participant’s role in procurement.

Potential commercial structures include recurring subscriptions, per-case pricing, on-premises licensing, enterprise integration, support and recurring revenue assurance analytics. Each is exploratory. A pilot should establish which buyer owns the workflow and whether incremental value exceeds the costs and the organization’s existing controls.

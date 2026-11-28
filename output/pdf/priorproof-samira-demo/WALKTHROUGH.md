# PriorProof demo case — Samira Demo

All records are fictional. Use a fresh case for each run. The checks below use PriorProof’s deterministic **Demo rules** provider (`AI_PROVIDER=mock`).

## 1. Create the case and upload the first five PDFs

Use **Samira Demo** for patient name and **SIM-DEMO-701** for patient ID. Keep the optional diagnosis, treatment, cost and admission date blank so the demo can show what the records do and do not establish.

| File in `01-upload-first` | Upload category | What to check after processing |
| --- | --- | --- |
| `01-admission.pdf` | Admission notes | The patient name and ID have source excerpts on page 1. This note states an admission date of **12 November 2026**. |
| `02-clinical-incomplete.pdf` | Clinical notes | The category is present. The essential **Provisional diagnosis** remains missing because the source says “Not recorded.” |
| `03-diagnostic.pdf` | Diagnostic reports | **Diagnostic finding** links to page **2** and quotes “Finding: No fracture reported.” |
| `04-treatment-conflicting.pdf` | Treatment plans | This file states **13 November 2026**. Both dates have source quotes. Together they create an **Admission date** conflict. The treatment field also has a source quote. |
| `05-cost-estimate.pdf` | Cost estimates | The **INR 18,500.00** estimate has a matching excerpt on page 1. |

Select **Process documents**. In the test run, this yielded **69.2% readiness**, eight source-supported fields, and ten blockers including pending staff reviews. In **Evidence Graph** or **Review Evidence**, show both dates and their sources. Show that **Insurance identification** is missing and that readiness is blocked. You can also start **Agent Activity** after processing to show the agent pause for the insurance document.

### Optional evidence-status demonstration

Open the diagnostic finding’s source on page 2. For the exercise, set **Unable to verify** and observe that the field’s evidence status becomes **Unsupported**. Reopen the excerpt and set **Verified** to restore **Supported**. This is a staff decision exercise. The PDF itself contains a valid excerpt. **Supported** means the value matches the cited source. **Verified** records a separate staff decision.

## 2. Add the recovery documents

| File in `02-recovery` | Upload category | Expected change |
| --- | --- | --- |
| `06-clinical-addendum.pdf` | Clinical notes | The diagnosis appears with a page 1 citation. |
| `07-treatment-corrected.pdf` | Treatment plans | This version agrees with the admission note. Keep the original so you can show why the conflict still needs staff review. |
| `08-insurance-identification.pdf` | Insurance identification | The matching document category clears the missing-insurance checklist item. |

Process the documents again, or confirm the insurance upload and resume from Agent Activity. In **Review Evidence**, reject the **13 November** date from the original treatment plan. Verify the **12 November** entries and all other remaining fields against their cited sources, including repeat proposals from separate documents. The verified run reached **100% readiness with zero blockers**. Mark the case ready and open **Generate Packet** to view the PDF draft without a staff override.

## 3. Optional blank-file test

Upload `03-optional/09-blank-diagnostic.pdf` **in a separate test case** under **Diagnostic reports**. This is an intentionally blank, valid PDF. The upload is accepted and the document shows **Uploaded — no readable text**. Processing produces zero extracted fields.

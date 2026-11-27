import json
from pathlib import Path

RULES = json.loads(Path(__file__).with_name("readiness_rules.json").read_text())
REQUIRED = RULES["requiredDocuments"]
ESSENTIAL = RULES["essentialFields"]
CRITICAL_FIELDS = set(RULES["criticalFields"])
CRITICAL_DOCUMENTS = set(RULES["criticalDocuments"])
WEIGHTS = RULES["weights"]

if set(WEIGHTS) != {"documents", "fields", "evidence", "verification", "conflicts"} or (
    sum(WEIGHTS.values()) != 100 or min(WEIGHTS.values()) < 0
):
    raise ValueError("Readiness weights must be nonnegative and total 100")


def build_readiness(case, documents, fields, checklist, conflicts, unsupported):
    actions, blockers = [], []

    def recommend(title, why, subject, view, target, blocking=False):
        action = dict(title=title, why=why, subject=subject, view=view, target=target)
        actions.append(action)
        if blocking:
            blockers.append(action)

    missing = [row["requirement"] for row in checklist if row["status"] == "Missing"]
    for name in missing:
        if name in CRITICAL_DOCUMENTS:
            recommend("Upload a required document", "This checklist item has no matching document.", name, "Documents", "upload-documents", True)

    for doc in documents:
        if doc["status"] == "Uploaded" or "readable text" in doc["status"] or "OCR failed" in doc["status"]:
            recommend("Replace or inspect this document", "At least one page has no readable text. Try a clearer scan or a text PDF.",
                      doc["filename"], "Documents", f'document-{doc["id"]}')

    if case["status"] in {"Documents Uploaded", "Processing Failed"}:
        recommend("Analyze the uploaded documents", "The current document set has no completed analysis.",
                  "Document processing", "Documents", "process-documents", True)

    present, cited, reviewed = set(), set(), set()
    for name, case_key in ESSENTIAL.items():
        candidates = [f for f in fields if f["name"] == name and f["evidenceStatus"] in {"Supported", "Staff-entered"}]
        if candidates or (case.get(case_key) is not None and str(case[case_key]).strip()):
            present.add(name)
        if any(f["evidenceStatus"] == "Supported" for f in candidates):
            cited.add(name)
        if any(f["review"] in {"Verified", "Edited"} for f in candidates):
            reviewed.add(name)
        if name not in present:
            recommend("Find the essential field in the records", "No usable value has been recorded. Add the source that states it explicitly.",
                      name, "Documents", "upload-documents", name in CRITICAL_FIELDS)

    for field in unsupported:
        recommend("Inspect the unsupported proposal", "The cited page did not substantiate this field. Check the source and add a clearer record if needed.",
                  field["name"], "Evidence graph", f'rejected-{field["id"]}')
    for field in fields:
        if field["evidenceStatus"] == "Unsupported":
            recommend("Check the source for this field", "The cited page does not substantiate the current value.",
                      field["name"], "Review & evidence", f'field-{field["id"]}')

    for conflict in conflicts:
        recommend("Resolve the contradictory values", "Compare the cited sources and verify the supported value.",
                  conflict["field"], "Review & evidence", f'field-{conflict["values"][0]["fieldId"]}',
                  conflict["field"] in CRITICAL_FIELDS)

    for name in ESSENTIAL:
        if name in present and name not in reviewed:
            remaining = next((f for f in fields if f["name"] == name and f["review"] not in {"Rejected", "Unable to Verify"}), None)
            recommend("Verify the essential field", "A staff reviewer must verify this value against the record.",
                      name, "Review & evidence", f'field-{remaining["id"]}' if remaining else "staff-field",
                      name in CRITICAL_FIELDS)
    for field in fields:
        if field["review"] in {"Unreviewed", "Unable to Verify"} and (
            field["name"] not in ESSENTIAL or field["name"] in reviewed
        ):
            recommend("Review the remaining field", "Record a review decision for this proposal.",
                      field["name"], "Review & evidence", f'field-{field["id"]}', True)
    for name in missing:
        if name not in CRITICAL_DOCUMENTS:
            recommend("Upload a checklist document", "This checklist item has no matching document.", name, "Documents", "upload-documents")
    if case["status"] == "Processing":
        blockers.append(dict(subject="Document processing", why="Wait for analysis to finish."))

    conflict_names = {conflict["field"] for conflict in conflicts}
    dimensions = [
        ("documents", "Required documents", len(checklist) - len(missing), len(checklist), "Required checklist categories with a matching upload"),
        ("fields", "Essential fields", len(present), len(ESSENTIAL), "Configured essential fields with a recorded value"),
        ("evidence", "Source evidence", len(cited), len(ESSENTIAL), "Essential fields with a valid field-specific source citation"),
        ("verification", "Human verification", len(reviewed), len(ESSENTIAL), "Essential fields with at least one reviewed, usable value"),
        ("conflicts", "Conflict resolution", len(present - conflict_names), len(ESSENTIAL), "Essential fields with a value and no open conflict"),
    ]
    components = [
        dict(key=key, label=label, earned=round(weight * count / total, 2) if total else 0,
             weight=weight, numerator=count, denominator=total, definition=definition)
        for key, label, count, total, definition in dimensions
        for weight in [WEIGHTS[key]]
    ]
    return dict(
        score=round(sum(part["earned"] for part in components), 1),
        components=components, blockers=blockers, canMarkReady=not blockers,
        override=case.get("reviewNotes"),
        essentialFields=list(ESSENTIAL),
        missingEssentialFields=[name for name in ESSENTIAL if name not in present],
        recommendations=actions,
    )

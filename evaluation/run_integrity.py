"""Reproduce deterministic claims metrics; this benchmark does not run OCR or an LLM."""
import argparse
import json
import sys
from pathlib import Path
from time import perf_counter
from statistics import mean

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE / "backend"))
from app.financial_reconciliation import CAP_RULE, CONTRACT_RULE, calculate  # noqa: E402


def events_for(fixture):
    events = []

    def add(kind, id_, amounts, **details):
        entry = dict(id=id_, kind=kind, amounts=amounts, supported=True, supersedes=None,
                     related=None, rule=None, closure=None)
        entry.update(details)
        events.append(entry)

    if "estimate" in fixture:
        add("estimate", "estimate", {"estimate": fixture["estimate"]})
    if "authorization" in fixture:
        add("initial_authorization", "auth", {"authorization": fixture["authorization"]})
    if "revised" in fixture:
        add("revised_authorization", "revised-auth", {"authorization": fixture["revised"]},
            supersedes="auth" if fixture.get("supersede") else None)
    if "bill" in fixture:
        add("bill", "bill", {"bill": fixture["bill"]})
    if fixture.get("terms"):
        terms = {"adjustment": 1_500_000, "allowable": 10_000_000, "responsibility": 1_000_000}
        rule = None if fixture.get("unsupportedRule") else CONTRACT_RULE
        if "policyCap" in fixture:
            terms["policy_limit"] = fixture["policyCap"]
            rule = CAP_RULE
        add("agreement", "agreement", terms, rule=rule)
    if "settlement" in fixture:
        add("settlement", "advice", {"settlement": fixture["settlement"]},
            closure="partial" if fixture.get("partial") else "final")
    if "payment" in fixture:
        add("payment", "receipt", {"payment": fixture["payment"]})
    if "reversal" in fixture:
        add("reversal", "reversal", {"payment": fixture["reversal"]}, related="receipt")
    return events


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    fixtures = json.loads((BASE / "evaluation/claim_integrity_cases.json").read_text())
    cases, timings = [], []
    exact = total = 0
    evidence_supported = evidence_total = unknown_correct = unknown_total = 0
    count_labels = {"authorization drift": "authorization-drift", "payment variance": "payment-variance"}
    counts = {key: dict(tp=0, fp=0, fn=0, tn=0) for key in count_labels}
    for fixture in fixtures:
        events = events_for(fixture)
        start = perf_counter()
        result = calculate(events, enhancement_threshold=fixture.get("threshold"))
        timings.append((perf_counter() - start) * 1000)
        expected_findings, actual_findings = set(fixture["findings"]), {f["id"] for f in result["findings"]}
        actual = {key: result["amounts"].get(key, {}).get("paise") for key in fixture["expected"]}
        supporting_ids = {event["id"] for event in events}
        for row in [*result["findings"], *result["amounts"].values()]:
            evidence_total += 1
            evidence_supported += bool(row["evidence"] and set(row["evidence"]) <= supporting_ids)
        for key, expected in fixture["expected"].items():
            total += 1
            exact += actual[key] == expected
            if expected is None:
                unknown_total += 1
                unknown_correct += actual[key] is None
        for group, label in count_labels.items():
            present, wanted = label in actual_findings, label in expected_findings
            counts[group][("tp" if wanted else "fp") if present else ("fn" if wanted else "tn")] += 1
        cases.append(dict(scenario=fixture["name"], exact=actual == fixture["expected"] and actual_findings == expected_findings,
                          expectedAmounts=fixture["expected"], actualAmounts=actual, expectedFindings=sorted(expected_findings),
                          actualFindings=sorted(actual_findings)))
    for metrics in counts.values():
        tp, fp, fn, tn = (metrics[key] for key in ("tp", "fp", "fn", "tn"))
        metrics.update(precision=tp / (tp + fp) if tp + fp else None,
                       recall=tp / (tp + fn) if tp + fn else None,
                       falsePositiveRate=fp / (fp + tn) if fp + tn else None)
    output = dict(provider="deterministic", synthetic=True, scenarios=len(cases),
                  exactScenarios=sum(case["exact"] for case in cases), exactValues=exact, valuesCompared=total,
                  evidenceReferenceChecks={"supported": evidence_supported, "total": evidence_total},
                  unknownChecks={"correct": unknown_correct, "total": unknown_total},
                  classifications=counts, meanCalculationMs=round(mean(timings), 4), cases=cases,
                  limitations=["Fixtures supply verified records directly. The evidence score checks case event linkage, not extraction or clinical correctness.",
                               "API ordering, privacy, deletion, agent resumption and simulation isolation are tested separately.",
                               "This synthetic benchmark measures the calculation only. It provides no evidence of hospital performance."])
    serialized = json.dumps(output, indent=2)
    if args.output:
        args.output.write_text(serialized + "\n")
    print(f"Exact scenarios: {output['exactScenarios']}/{len(cases)}. Exact values: {exact}/{total}. Mean calculation: {output['meanCalculationMs']} ms.")
    return 0 if output["exactScenarios"] == len(cases) else 1


if __name__ == "__main__":
    sys.exit(main())

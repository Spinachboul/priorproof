"""Deterministic claim calculations. Amounts are integer INR paise."""
from collections import defaultdict

CONTRACT_RULE = "verified-net-responsibility-v1"
CAP_RULE = "verified-net-responsibility-with-policy-cap-v1"
REIMBURSEMENT_RULES = {
    CONTRACT_RULE: "Allowable amount minus verified patient responsibility",
    CAP_RULE: "The lower of the verified policy limit and allowable amount minus verified patient responsibility",
}
STAGES = {
    "admission": ("Admission", {}),
    "estimate": ("Treatment estimate", {"estimate": "Estimated treatment cost"}),
    "initial_authorization": ("Initial authorization", {"authorization": "Authorized amount"}),
    "treatment_update": ("Treatment update and revised estimate", {"estimate": "Estimated treatment cost"}),
    "enhancement_request": ("Enhancement request", {}),
    "revised_authorization": ("Revised authorization", {"authorization": "Authorized amount"}),
    "discharge_authorization": ("Final discharge authorization", {"authorization": "Authorized amount"}),
    "agreement": ("Hospital-insurer agreement and policy terms", {
        "adjustment": "Contractual adjustment", "allowable": "Contractually allowable amount",
        "responsibility": "Patient responsibility",
    }),
    "bill": ("Hospital bill", {"bill": "Gross billed amount"}),
    "settlement": ("Settlement advice", {"settlement": "Insurer settlement amount"}),
    "payment": ("Payment confirmation", {"payment": "Confirmed payment"}),
    "reversal": ("Payment reversal", {"payment": "Reversed payment"}),
    "refund": ("Insurer payment refund", {"payment": "Refunded insurer payment"}),
    "resolution": ("Administrative resolution", {}),
}
OPTIONAL_MONEY = {
    "agreement": {"policy_limit": "Policy limit", "copayment": "Co-payment", "deductible": "Deductible",
                  "noncovered": "Non-covered expenses"},
    "settlement": {"deduction": "Documented deduction"},
}
FAMILY = {
    "estimate": "estimate", "treatment_update": "estimate",
    "initial_authorization": "authorization", "revised_authorization": "authorization",
    "discharge_authorization": "authorization", "bill": "bill", "agreement": "agreement", "settlement": "settlement",
}
MOVEMENTS = {"payment", "reversal", "refund"}
PREREQUISITES = {
    "estimate": {"admission"}, "initial_authorization": {"estimate"}, "treatment_update": {"estimate"},
    "enhancement_request": {"initial_authorization"}, "revised_authorization": {"initial_authorization"},
    "discharge_authorization": {"initial_authorization"}, "agreement": {"admission"}, "bill": {"admission"},
    "settlement": {"bill"}, "payment": {"settlement"}, "reversal": {"payment"}, "refund": {"payment"},
    "resolution": {"settlement"},
}


def calculate(events, enhancement_threshold=None):
    """Build current values and finding lineage from verified, non-superseded events."""
    superseded = {event["supersedes"] for event in events if event["supported"] and event["supersedes"]}
    current = defaultdict(list)
    for event in events:
        if event["id"] not in superseded and event["kind"] in FAMILY:
            current[FAMILY[event["kind"]]].append(event)

    amounts, findings = {}, []

    def finding(code, category, status, action, evidence=(), paise=None, priority="Review"):
        findings.append({"id": code, "category": category, "status": status, "action": action,
                         "evidence": list(dict.fromkeys(evidence)), "paise": paise, "priority": priority})

    def amount(name, paise, evidence, rule=None, formula=None, inputs=()):
        amounts[name] = {"paise": paise, "currency": "INR", "evidence": list(dict.fromkeys(evidence)),
                         "origin": "Calculated" if rule else "Source fact", "rule": rule, "formula": formula, "inputs": list(inputs)}

    def choose(family):
        records = current[family]
        if any(not event["supported"] for event in records):
            return None
        if len(records) == 1:
            return records[0]
        if len(records) > 1:
            values = {tuple(sorted(e["amounts"].items())) + (("terms", (e["rule"], e["closure"])),) for e in records}
            if len(values) == 1:
                return records[-1]
            finding(f"conflict-{family}", "Conflicting financial documents", "Requires human judgment",
                    f"Compare the {family} sources and record an explicit, evidenced supersession.",
                    [e["id"] for e in records], priority="High")
        return None

    for event in events:
        if not event["supported"] and event["id"] not in superseded:
            finding("source-" + event["id"], "Unsupported financial information", "Missing information",
                    "Restore the source evidence or record a verified replacement.", [event["id"]])

    selected = {family: choose(family) for family in dict.fromkeys(FAMILY.values())}
    for event in selected.values():
        if event:
            for name, value in event["amounts"].items():
                if name != "responsibility":
                    amount(name, value, [event["id"]])

    if estimate := amounts.get("estimate"):
        if authorization := amounts.get("authorization"):
            evidence = estimate["evidence"] + authorization["evidence"]
            gap = estimate["paise"] - authorization["paise"]
            amount("authorization_gap", gap, evidence, "recorded-amount-comparison-v1", "Estimate minus recorded authorization", ("estimate", "authorization"))
            if gap > 0 and (enhancement_threshold is None or gap >= enhancement_threshold):
                finding("authorization-drift", "Authorization drift", "Potential discrepancy",
                        "Review whether the payer requires a documented enhancement.", evidence, gap)

    bill, agreement, settlement = (selected[key] for key in ("bill", "agreement", "settlement"))
    expected = None
    if bill and agreement:
        terms = agreement["amounts"]
        basis = [bill["id"], agreement["id"]]
        if bill["amounts"]["bill"] != terms["adjustment"] + terms["allowable"]:
            finding("bill-inconsistent", "Billing inconsistency", "Verified discrepancy",
                    "Check the latest bill and the applicable documented adjustment.", basis, priority="High")
            finding("responsibility-under-review", "Unverified patient responsibility", "Requires contractual verification",
                    "Confirm the patient amount against the revised bill and applicable terms.", basis)
        else:
            amount("responsibility", terms["responsibility"], [agreement["id"]])
            rule = agreement["rule"]
            net_allowable = terms["allowable"] - terms["responsibility"]
            limit = terms.get("policy_limit")
            if rule == CAP_RULE and limit is not None:
                expected = min(limit, net_allowable)
            elif rule == CONTRACT_RULE and (limit is None or net_allowable <= limit):
                expected = net_allowable
            if expected is not None:
                inputs = ["allowable", "responsibility"] + (["policy_limit"] if rule == CAP_RULE else [])
                amount("expected", expected, basis, rule, REIMBURSEMENT_RULES[rule], inputs)
            else:
                finding("contract-rule", "Contractual information unavailable", "Requires contractual verification",
                        "Confirm the calculation method and applicable policy limit before estimating reimbursement.", basis)
    elif bill:
        finding("missing-agreement", "Contractual information unavailable", "Requires contractual verification",
                "Obtain the applicable agreement and verified policy terms.", [bill["id"]])
    if bill and not agreement:
        finding("responsibility-unknown", "Unverified patient responsibility", "Missing information",
                "Ask staff to verify patient responsibility from applicable policy evidence.", [bill["id"]])

    payments = [event for event in events if event["kind"] in MOVEMENTS]
    payment_by_id = {event["id"]: event for event in payments}
    supports = all(event["supported"] and (event["kind"] == "payment"
                   or payment_by_id[event["related"]]["supported"]) for event in payments)
    net = None
    if payments and supports:
        net = sum(event["amounts"]["payment"] * (1 if event["kind"] == "payment" else -1) for event in payments)
        amount("received", net, [event["id"] for event in payments], "posted-payments-v1",
               "Verified payment confirmations minus reversals and refunds")

    if expected is not None and settlement:
        basis = amounts["expected"]["evidence"] + [settlement["id"]]
        if net is None:
            finding("missing-payment", "Outstanding insurer payment", "Missing information",
                    "Obtain payment confirmation and reconcile the remittance.", basis)
        else:
            basis += amounts["received"]["evidence"]
            difference = expected - net
            if difference > 0 and (settlement["closure"] == "partial" or net < settlement["amounts"]["settlement"]):
                amount("outstanding", difference, basis, "open-remittance-v1",
                       "Expected reimbursement minus confirmed receipts while payment remains open", ("expected", "received"))
                finding("outstanding-payment", "Outstanding insurer payment", "Requires payer clarification",
                        "Confirm the timing and status of the remaining settlement.", basis, difference)
            elif difference and (settlement["closure"] == "final" or difference < 0):
                amount("variance", difference, basis, "settlement-comparison-v1",
                       "Expected reimbursement minus confirmed net receipts", ("expected", "received"))
                category, status = "Unexplained settlement difference", "Potential discrepancy"
                if difference < 0:
                    category = "Potential overpayment"
                elif settlement["amounts"].get("deduction"):
                    category, status = "Documented insurer deduction", "Requires contractual verification"
                finding("payment-variance", category, status,
                        "Investigate the remittance explanation and approved agreement.", basis, difference, "High")
            if settlement["amounts"]["settlement"] != net:
                finding("remittance-mismatch", "Settlement advice and receipts differ", "Requires payer clarification",
                        "Check that all recorded receipts are covered by the latest remittance advice.", basis)

    return {"amounts": amounts, "findings": findings, "superseded": sorted(superseded)}


def simulate(events, current, action, paise, enhancement_threshold=None):
    """Calculate on a disposable copy. This function has no database dependency."""
    kind, key = {
        "authorization": ("revised_authorization", "authorization"),
        "estimate": ("treatment_update", "estimate"),
        "payment": ("payment", "payment"),
    }[action]
    current_value = current["amounts"].get(key if action != "payment" else "received")
    if current_value is None:
        raise ValueError("Record the current verified amount before simulating the change")
    replacement = current_value["evidence"][0] if action != "payment" else None
    synthetic = {"id": "hypothetical", "kind": kind, "amounts": {key: paise}, "supported": True,
                 "supersedes": replacement, "rule": None, "closure": None, "related": None}
    # Also replace identical supporting versions of the selected value in the scenario only.
    version_ids = {e["id"] for e in events if replacement and e["id"] not in current["superseded"]
                   and FAMILY.get(e["kind"]) == FAMILY[kind]}
    hypothetical = calculate([e for e in events if e["id"] not in version_ids] + [synthetic], enhancement_threshold)
    resolved = sorted({f["category"] for f in current["findings"]} - {f["category"] for f in hypothetical["findings"]})
    return {
        "simulated": True, "action": action, "requiredEvidence": STAGES[kind][0],
        "before": current["amounts"], "after": hypothetical["amounts"], "resolved": resolved,
        "remaining": hypothetical["findings"],
        "limitations": "What-if only. Actual records require new verified evidence and staff confirmation. Authorization is separate from final coverage.",
    }

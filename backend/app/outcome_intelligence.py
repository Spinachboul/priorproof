"""Case-scoped, synthetic operational feedback. Suggestions require staff review."""
import json

SCHEMA = """
create table if not exists integrity_outcomes(
    id TEXT PRIMARY KEY, case_id TEXT NOT NULL, event_id TEXT NOT NULL,
    category TEXT NOT NULL, reason TEXT NOT NULL, amount_paise INTEGER,
    profile_version TEXT, recorded_at TEXT NOT NULL, reviewer TEXT NOT NULL,
    unique(case_id, event_id, category)
);
"""

CATEGORIES = {
    "authorization-recorded": ("Authorization approval recorded", {"initial_authorization", "revised_authorization", "discharge_authorization"}),
    "enhancement-requested": ("Enhancement requested", {"enhancement_request"}),
    "clarification-requested": ("Clarification requested", {"enhancement_request", "settlement"}),
    "additional-documentation-requested": ("Additional documentation requested", {"enhancement_request", "settlement"}),
    "authorization-declined": ("Authorization declined", {"resolution"}),
    "partial-settlement": ("Partial settlement", {"settlement"}),
    "full-settlement": ("Full settlement recorded", {"settlement"}),
    "payment-disputed": ("Payment disputed", {"settlement"}),
    "additional-payment": ("Additional payment received", {"payment"}),
    "administrative-resolution": ("Administrative issue resolved", {"resolution"}),
}
REASONS = ("Documentation review", "Authorization change", "Settlement follow-up", "Verified payment confirmation", "Staff resolution")


def inspect(connection, cid, events):
    supported = {event["id"] for event in events if event["supported"]}
    outcomes = [dict(row) for row in connection.execute(
        """select id, event_id as eventId, category, reason, amount_paise as paise,
                  profile_version as profileVersion, recorded_at as recordedAt, reviewer
           from integrity_outcomes where case_id=? order by recorded_at""", (cid,),
    )]
    for entry in outcomes:
        entry["label"] = CATEGORIES[entry["category"]][0]
        entry["simulated"] = True
        entry["verified"] = entry["eventId"] in supported
    counts = {}
    for entry in outcomes:
        if entry["verified"]:
            counts[entry["category"]] = counts.get(entry["category"], 0) + 1
    suggestions = []
    for category, count in counts.items():
        if category in {"clarification-requested", "additional-documentation-requested", "payment-disputed"} and count >= 2:
            suggestions.append({"category": category, "observations": count, "status": "Requires staff review",
                                "proposal": "Compare these records and propose a verification checklist change if the source terms support it."})
    if counts.get("additional-payment") and counts.get("administrative-resolution"):
        suggestions.append({"category": "remittance-follow-up", "observations": 1, "status": "Requires staff review",
                            "proposal": "Consider checking for a separate payment confirmation before closing a remittance variance."})
    return {"label": "Simulated workflow analytics", "records": outcomes, "counts": counts, "suggestions": suggestions}


def allowed(case_privacy):
    return case_privacy is not None and json.loads(case_privacy["authorization"] or "{}").get("synthetic") is True

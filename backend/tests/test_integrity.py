from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
import pymupdf

from app import main, privacy
from app.claim_integrity import parse_source
from app.financial_reconciliation import CAP_RULE, CONTRACT_RULE, calculate
from test_workflow import pdf_bytes


def sample(eid, kind, amounts, *, closure=None, supersedes=None, rule=None, related=None, supported=True):
    return dict(id=eid, kind=kind, amounts=amounts, closure=closure, rule=rule, supersedes=supersedes,
                related=related, supported=supported)


def base_finances(*, received=8_200_000, settlement=8_200_000, closure="final"):
    return [
        sample("b", "bill", {"bill": 11_500_000}),
        sample("a", "agreement", {"adjustment": 1_500_000, "allowable": 10_000_000, "responsibility": 1_000_000},
               rule=CONTRACT_RULE),
        sample("s", "settlement", {"settlement": settlement}, closure=closure),
        sample("p", "payment", {"payment": received}),
    ]


class ArithmeticTests(unittest.TestCase):
    def test_reconciliation_cases_are_exact_and_independent_of_liability(self):
        for received, advice, closure, key, value in (
            (8_200_000, 8_200_000, "final", "variance", 800_000),
            (9_100_001, 9_100_001, "final", "variance", -100_001),
            (8_200_000, 8_200_000, "partial", "outstanding", 800_000),
            (8_200_000, 9_000_000, "final", "outstanding", 800_000),
            (9_000_000, 9_000_000, "final", "received", 9_000_000),
        ):
            with self.subTest(received=received, advice=advice, closure=closure):
                amounts = calculate(base_finances(received=received, settlement=advice, closure=closure))["amounts"]
                self.assertEqual(amounts[key]["paise"], value)
                self.assertEqual(amounts["responsibility"]["paise"], 1_000_000)
                self.assertEqual(amounts["expected"]["evidence"], ["b", "a"])
                if key != "variance":
                    self.assertNotIn("variance", amounts)

    def test_missing_agreement_bad_rule_and_revised_bill(self):
        original = base_finances()
        self.assertNotIn("responsibility", calculate([original[0], *original[2:]])["amounts"])
        no_rule = [dict(row, rule=None) for row in original]
        self.assertNotIn("expected", calculate(no_rule)["amounts"])
        events = original + [sample("new", "bill", {"bill": 11_700_000}, supersedes="b")]
        result = calculate(events)
        self.assertNotIn("expected", result["amounts"])
        self.assertIn("bill-inconsistent", [f["id"] for f in result["findings"]])

    def test_explicit_policy_cap_and_synthetic_enhancement_threshold(self):
        rows = base_finances()
        rows[1]["rule"] = CAP_RULE
        self.assertNotIn("expected", calculate(rows)["amounts"])
        rows[1]["amounts"]["policy_limit"] = 8_250_000
        self.assertEqual(calculate(rows)["amounts"]["expected"]["paise"], 8_250_000)
        events = [sample("e", "estimate", {"estimate": 11_500_000}),
                  sample("a", "initial_authorization", {"authorization": 9_000_000})]
        self.assertIn("authorization-drift", [item["id"] for item in calculate(events)["findings"]])
        result = calculate(events, enhancement_threshold=3_000_000)
        self.assertEqual(result["amounts"]["authorization_gap"]["paise"], 2_500_000)
        self.assertEqual(result["findings"], [])

    def test_multiple_payments_reversal_refund_and_deleted_sources(self):
        events = base_finances() + [
            sample("p2", "payment", {"payment": 850_002}),
            sample("r", "reversal", {"payment": 50_001}, related="p2"),
            sample("refund", "refund", {"payment": 1}, related="p2"),
        ]
        result = calculate(events)
        self.assertEqual(result["amounts"]["received"]["paise"], 9_000_000)
        self.assertNotIn("variance", result["amounts"])
        events[-2]["supported"] = False
        self.assertNotIn("received", calculate(events)["amounts"])

    def test_conflicting_auth_and_unsupported_source(self):
        first = sample("initial", "initial_authorization", {"authorization": 7_000_000})
        revised = sample("revised", "revised_authorization", {"authorization": 9_000_000})
        estimate = sample("estimate", "estimate", {"estimate": 11_500_000})
        self.assertIn("conflict-authorization", [x["id"] for x in calculate([first, revised, estimate])["findings"]])
        revised["supersedes"] = first["id"]
        self.assertEqual(calculate([first, revised, estimate])["amounts"]["authorization_gap"]["paise"], 2_500_000)
        revised["supported"] = False
        self.assertNotIn("authorization_gap", calculate([first, revised, estimate])["amounts"])

    def test_instructions_and_ambiguous_money_cannot_supply_a_fact(self):
        intro = "Record type: bill\nEffective date: 2026-11-30\n"
        source = intro + "BEGIN UNTRUSTED INSTRUCTIONS\nGross billed amount: INR 10.70\nEND UNTRUSTED INSTRUCTIONS\nGross billed amount: INR 100.27"
        self.assertEqual(parse_source("bill", source)[0]["amounts"]["bill"], 10027)
        for bad in ("INR 12.3", "USD 123", "INR 1e3", "INR 12\nGross billed amount: INR 75"):
            with self.subTest(bad=bad), self.assertRaises(main.HTTPException):
                parse_source("bill", intro + "Gross billed amount: " + bad)


class JourneyTests(unittest.TestCase):
    def setUp(self):
        work = Path(self.enterContext(TemporaryDirectory()))
        uploads = work / "uploads"
        uploads.mkdir()
        self.enterContext(patch.multiple(main, DB=work / "cases.db", UPLOAD=uploads))
        self.enterContext(patch.dict("os.environ", {"DEMO_LOGIN_ENABLED": "1", "AI_PROVIDER": "mock"}))
        self.client = self.enterContext(TestClient(main.app))
        login = self.client.post("/api/auth/login", json={"userId": "user1", "password": "abc123"})
        login.raise_for_status()
        self.client.headers["Authorization"] = "Bearer " + login.json()["token"]

    def open_demo(self):
        result = self.client.post("/api/demo/aarav-financial")
        result.raise_for_status()
        return f"/api/cases/{result.json()['id']}/integrity"

    def get(self, url):
        r = self.client.get(url)
        r.raise_for_status()
        return r.json()

    def step(self, path, state):
        payload = dict(expectedRevision=state["revision"], staffConfirmed=True, step=state["demo"]["next"])
        next_state = self.client.post(path + "/demo-step", json=payload)
        self.assertEqual(next_state.status_code, 200, next_state.text)
        self.assertEqual(next_state.json(), self.client.post(path + "/demo-step", json=payload).json())
        return next_state.json()

    def test_complete_financial_journey_and_protected_reports(self):
        original = self.client.post("/api/demo/aarav").json()["id"]
        path = self.open_demo()
        case_id = self.get(path)["caseReference"]
        self.assertNotEqual(case_id, original)
        state = self.get(path)
        for _ in range(4):
            state = self.step(path, state)
        self.assertEqual(state["amounts"]["authorization_gap"]["paise"], 4_500_000)
        prior = self.get(path)
        simulated = self.client.post(path + "/simulate", json=dict(expectedRevision=state["revision"],
                                                                  action="authorization", paise=9_000_000)).json()
        self.assertEqual(simulated["after"]["authorization_gap"]["paise"], 2_500_000)
        self.assertEqual(prior, self.get(path))
        for _ in range(6):
            state = self.step(path, state)
        self.assertEqual(state["amounts"]["variance"]["paise"], 800_000)
        self.assertEqual(state["amounts"]["responsibility"]["paise"], 1_000_000)
        self.assertEqual(state["amounts"]["received"]["paise"], 8_200_000)
        first = next(e for e in state["events"] if e["kind"] == "initial_authorization")
        self.assertTrue(first["superseded"])
        self.assertEqual(first["source"]["excerpts"]["authorization"], "Authorized amount: INR 70000")
        simulated = self.client.post(path + "/simulate", json=dict(expectedRevision=state["revision"],
                                                                  action="payment", paise=800_000)).json()
        self.assertNotIn("variance", simulated["after"])
        self.assertEqual(self.get(path), state)
        old_revision = state["revision"]
        report = path + "/patient-summary.pdf"
        self.assertEqual(self.client.get(report, params={"revision": old_revision}).status_code, 409)
        self.client.post(path + "/review", json={"expectedRevision": old_revision, "staffConfirmed": True}).raise_for_status()
        for _ in range(3):
            state = self.step(path, state)
        self.assertEqual(self.client.get(report, params={"revision": old_revision}).status_code, 409)
        self.assertEqual(state["amounts"]["received"]["paise"], 9_000_000)
        self.assertNotIn("variance", state["amounts"])
        self.assertEqual([entry["status"] for entry in state["paymentHistory"]], ["Potential payment variance", "Reconciled"])
        flagged = state["paymentHistory"][0]
        self.assertEqual(flagged["expected"] - flagged["received"], 800_000)
        self.assertEqual(state["amounts"]["responsibility"]["paise"], 1_000_000)
        current = {"expectedRevision": state["revision"], "staffConfirmed": True}
        payment = [entry for entry in state["events"] if entry["kind"] == "payment"][-1]
        resolution = next(entry for entry in state["events"] if entry["kind"] == "resolution")
        for event, category, reason in ((payment, "additional-payment", "Verified payment confirmation"),
                                        (resolution, "administrative-resolution", "Staff resolution")):
            feedback = {**current, "eventId": event["id"], "category": category, "reason": reason}
            outcome = self.client.post(path + "/outcomes", json=feedback)
            outcome.raise_for_status()
            self.assertEqual(outcome.json(), self.client.post(path + "/outcomes", json=feedback).json())
        self.assertEqual(len(outcome.json()["outcomes"]["records"]), 2)
        self.assertEqual(outcome.json()["outcomes"]["suggestions"][0]["status"], "Requires staff review")
        mobile = self.get(path + "/summary")
        self.assertEqual(mobile["amounts"]["responsibility"], 1_000_000)
        self.assertNotIn("events", mobile)
        self.client.post(path + "/review", json=current).raise_for_status()
        for slug in ("patient-summary", "report", "investigation"):
            r = self.client.get(path + "/" + slug + ".pdf", params={"revision": state["revision"]})
            self.assertEqual(r.status_code, 200, r.text if r.status_code != 200 else "")
            with pymupdf.open(stream=r.content, filetype="pdf") as doc:
                rendered = "".join(page.get_text() for page in doc)
            self.assertIn("Fictional demonstration document", rendered)
            if slug == "investigation":
                self.assertIn("8,000.00", rendered)
                self.assertIn("Payment investigation history", rendered)
            if slug == "patient-summary":
                self.assertIn("10,000.00", rendered)
                self.assertNotIn("Aarav", rendered)
                self.assertNotIn("FICTIONAL-AARAV-001", rendered)
        with TestClient(main.app) as unauthenticated:
            self.assertEqual(unauthenticated.get(path).status_code, 401)
            self.assertEqual(unauthenticated.get(report, params={"revision": state["revision"]}).status_code, 401)
        self.client.delete(path + "/demo").raise_for_status()
        self.assertEqual(self.client.get(path).status_code, 404)
        self.assertEqual(self.client.get(f"/api/cases/{original}").status_code, 200)
        with closing(main.conn()) as connection:
            for table in ("integrity_events", "integrity_reviews", "integrity_demo_cases", "integrity_outcomes",
                          "integrity_profile_versions", "integrity_profile_pins", "integrity_payment_investigations"):
                self.assertFalse(connection.execute(f"select 1 from {table} where case_id=?", (case_id,)).fetchone())
        self.assertFalse((main.UPLOAD / case_id).exists())

    def test_existing_langgraph_resumes_integrity_only_with_verified_update(self):
        path = self.open_demo()
        case = path.removesuffix("/integrity")
        runs = case + "/agent/runs"
        started = self.client.post(runs, params={"mode": "integrity"})
        started.raise_for_status()
        run = started.json()
        self.assertEqual(run["status"], "waiting", run)
        self.assertEqual(run["tasks"][0]["id"], "integrity:admission")
        self.assertIsNone(self.get(runs + "/latest"))
        self.assertEqual(run["run_id"], self.get(runs + "/latest?mode=integrity")["run_id"])
        target = runs + "/" + run["run_id"]
        current = {"task_id": run["tasks"][0]["id"], "revision": run["revision"], "confirmed": True}
        self.assertEqual(self.client.post(target + "/input", json=current).status_code, 409)
        financial = self.step(path, self.get(path))
        current["revision"] = financial["revision"]
        self.client.post(target + "/input", json=current).raise_for_status()
        self.client.post(target + "/input", json=current).raise_for_status()
        with closing(main.conn()) as connection:
            self.assertEqual(connection.execute("select count(*) from audit_events where action='agent.staff-confirmed' and object_id=?",
                                               (run["run_id"],)).fetchone()[0], 1)
        main.agent.setup()
        resumed = self.client.post(target + "/resume")
        resumed.raise_for_status()
        updated = resumed.json()
        self.assertEqual(updated["revision"], financial["revision"])
        self.assertEqual(updated["history"].count(run["history"][0]), 1)
        self.assertEqual(updated["tasks"][0]["id"], "integrity:next-stage")
        self.assertEqual(self.client.post(target + "/resume").status_code, 409)

    def create_case(self, insurer=""):
        payload = {"patientName": "Fictional test case", "insurer": insurer, "processingAuthorization": {
            "purpose": "claim-integrity", "categories": ["financial-claim-records"], "recipients": ["hospital-desk"],
            "basis": "synthetic-demonstration", "noticeVersion": privacy.NOTICE_VERSION,
            "staffConfirmed": True, "synthetic": True}}
        result = self.client.post("/api/cases", json=payload)
        result.raise_for_status()
        return f"/api/cases/{result.json()['id']}"

    def document(self, case, kind, date, rest=""):
        result = self.client.post(case + "/documents", data={"categories": "Financial claim evidence"},
                                  files={"files": (f"{kind}.pdf", pdf_bytes(f"Record type: {kind}\nEffective date: {date}\n{rest}"), "application/pdf")})
        result.raise_for_status()
        return result.json()["documents"][0]["id"]

    def event(self, case, kind, document, **overrides):
        body = dict(eventKey=str(uuid4()), expectedRevision=self.get(case + "/integrity")["revision"],
                    staffConfirmed=True, kind=kind, documentId=document, page=1)
        body.update(overrides)
        return self.client.post(case + "/integrity/events", json=body)

    def test_case_ownership_order_staleness_deduplication_and_evidence_invalidation(self):
        case = self.create_case()
        another = self.create_case()
        admission = self.document(case, "admission", "2026-11-26")
        self.assertEqual(self.event(another, "admission", admission).status_code, 404)
        self.assertEqual(self.event(case, "admission", admission, expectedRevision="stale").status_code, 409)
        self.assertEqual(self.event(case, "admission", admission, staffConfirmed=1).status_code, 422)
        self.event(case, "admission", admission).raise_for_status()
        earlier = self.document(case, "bill", "2026-11-25", "Gross billed amount: INR 125000")
        self.assertEqual(self.event(case, "bill", earlier).status_code, 409)
        source = self.document(case, "bill", "2026-11-27", "Gross billed amount: INR 115000")
        key = str(uuid4())
        current = self.get(case + "/integrity")["revision"]
        recorded = self.event(case, "bill", source, expectedRevision=current, eventKey=key)
        recorded.raise_for_status()
        repeated = self.event(case, "bill", source, expectedRevision=current, eventKey=key)
        self.assertEqual(recorded.json()["eventId"], repeated.json()["eventId"])
        self.assertEqual(self.event(case, "bill", source).status_code, 409)
        paid = self.document(case, "settlement", "2026-11-28", "Insurer settlement amount: INR 82000\nSettlement status: final")
        self.event(case, "settlement", paid).raise_for_status()
        doc = self.document(case, "payment", "2026-11-29", "Confirmed payment: INR 82000\nTransaction reference: SAMPLE-RECEIPT")
        payment = self.event(case, "payment", doc)
        payment.raise_for_status()
        copy = self.document(case, "payment", "2026-11-30", "Confirmed payment: INR 82000\nTransaction reference: sample-receipt")
        self.assertEqual(self.event(case, "payment", copy).status_code, 409)
        reversal = self.document(case, "reversal", "2026-12-01", "Reversed payment: INR 2000\nTransaction reference: SAMPLE-REVERSAL")
        r = self.event(case, "reversal", reversal, related=payment.json()["eventId"])
        r.raise_for_status()
        self.assertEqual(r.json()["amounts"]["received"]["paise"], 8_000_000)
        self.client.delete(case + "/documents/" + doc).raise_for_status()
        self.assertNotIn("received", self.get(case + "/integrity")["amounts"])
        self.client.delete(case + "/documents/" + source).raise_for_status()
        self.assertNotIn("bill", self.get(case + "/integrity")["amounts"])

    def test_fictional_rule_versions_require_approval_and_explicit_case_pin(self):
        case = self.create_case("Northstar Health (fictional)")
        another = self.create_case("Northstar Health (fictional)")
        admission = self.document(case, "admission", "2026-11-26")
        self.event(case, "admission", admission).raise_for_status()
        estimate = self.document(case, "estimate", "2026-11-26", "Estimated treatment cost: INR 115000")
        self.event(case, "estimate", estimate).raise_for_status()
        initial = self.document(case, "initial_authorization", "2026-11-27", "Authorized amount: INR 90000")
        self.event(case, "initial_authorization", initial).raise_for_status()
        base = case + "/integrity"
        revision = self.get(base)["revision"]
        confirm = {"expectedRevision": revision, "staffConfirmed": True}
        response = self.client.put(base + "/profile", json={**confirm, "version": "demo-v1"})
        response.raise_for_status()
        confirm["expectedRevision"] = response.json()["revision"]
        proposal = {**confirm, "parent": "demo-v1", "effectiveDate": "2026-11-26",
                    "expiryDate": None, "enhancementThresholdPaise": 3_000_000}
        versions = self.client.post(base + "/profile/versions", json=proposal)
        versions.raise_for_status()
        profile = versions.json()["profile"]
        version = profile["history"][-1]["version"]
        self.assertEqual(self.client.post(base + "/profile/versions", json=proposal).json()["profile"], profile)
        self.assertEqual(self.client.put(base + "/profile", json={**confirm, "version": version}).status_code, 422)
        result = self.client.post(base + f"/profile/versions/{version}/approve", json=confirm)
        result.raise_for_status()
        self.assertEqual(result.json()["profile"]["pinnedVersion"], "demo-v1")
        self.assertEqual(self.get(another + "/integrity")["profile"]["history"][-1]["version"], "demo-v1")
        selected = self.client.put(base + "/profile", json={**confirm, "version": version})
        selected.raise_for_status()
        self.assertNotIn("authorization-drift", [item["id"] for item in selected.json()["findings"]])
        self.assertEqual(selected.json()["profile"]["pinnedVersion"], version)
        self.assertEqual(selected.json()["amounts"]["authorization_gap"]["paise"], 2_500_000)

    def test_migration_repeat_keeps_existing_cases_and_rejects_foreign_case(self):
        case = self.create_case()
        self.assertEqual(self.client.get(case + "/integrity").status_code, 200)
        main.init_db()
        main.init_db()
        self.assertEqual(self.client.get(case).status_code, 200)
        with closing(main.conn()) as connection, connection:
            connection.execute("update cases set owner_id='different-fixture-owner' where id=?", (case.rsplit("/", 1)[-1],))
        self.assertEqual(self.client.get(case + "/integrity").status_code, 404)
        self.assertEqual(self.client.post(case + "/integrity/review", json={"expectedRevision": "old", "staffConfirmed": True}).status_code, 404)

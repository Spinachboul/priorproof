from contextlib import closing
from datetime import date, timedelta
import json
import logging
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from test_workflow import pdf_bytes
from app import main, privacy


AUTHORIZATION = {
    "purpose": "preauthorization",
    "categories": ["patient-identification", "clinical-records"],
    "recipients": ["hospital-desk"],
    "basis": "synthetic-demonstration",
    "noticeVersion": privacy.NOTICE_VERSION,
    "staffConfirmed": True,
    "synthetic": True,
}
RAW = ["0000 0000 0000", "ZZZZZ0000Z", "0000000000", "aarav@example.invalid",
       "000000000000", "SYNTH-DEMO-8821"]
FIXTURE = Path(__file__).resolve().parents[2] / "public/evaluation/aarav-privacy-record.pdf"


class PrivacyTests(unittest.TestCase):
    def setUp(self):
        work = Path(self.enterContext(TemporaryDirectory()))
        uploads = work / "uploads"
        uploads.mkdir()
        self.enterContext(patch.object(main, "DB", work / "cases.db"))
        self.enterContext(patch.object(main, "UPLOAD", uploads))
        self.enterContext(patch.dict("os.environ", {"DEMO_ACCESS_KEY": "private-test-key", "AI_PROVIDER": "mock"}))
        self.enterContext(patch.object(main, "_failed_logins", main.deque()))
        self.enterContext(patch.object(main, "_anonymous_denials", main.deque()))
        self.client = self.enterContext(TestClient(main.app))
        login = self.client.post("/api/auth/login", json={"accessKey": "private-test-key"})
        login.raise_for_status()
        self.token = login.json()["token"]
        self.client.headers["Authorization"] = "Bearer " + self.token

    def post_case(self, **overrides):
        response = self.client.post("/api/cases", json={
            "patientName": "Fictional Privacy Test", "processingAuthorization": AUTHORIZATION, **overrides,
        })
        response.raise_for_status()
        return "/api/cases/" + response.json()["id"]

    def upload(self, case, content=None):
        response = self.client.post(case + "/documents", files={"files": ("fixture.pdf", content or FIXTURE.read_bytes(), "application/pdf")},
                                    data={"categories": "Other supporting documents"})
        response.raise_for_status()
        return response.json()["documents"][0]["id"]

    def test_screening_classification_masking_and_false_positives(self):
        fake = "Receipt 000000000000\nPatient ID: DEMO-1024\nAdmission date: 2026-11-26\nCost estimate: INR 85,000"
        self.assertFalse(privacy.detect(fake))
        text = "\n".join(("Aadhaar: 0000 0000 0000", "PAN: ZZZZZ0000Z", "Mobile: 0000000000",
                          "Email: aarav@example.invalid", "Bank account: 000000000000",
                          "Passport: X0000000", "Membership ID: SYNTH-DEMO-8821"))
        findings = privacy.detect(text)
        self.assertEqual({kind for _, _, kind in findings}, {"Aadhaar", "PAN", "Telephone", "Email", "Bank account", "Passport", "Membership ID"})
        masked = privacy.masked_preview(text, findings)
        for raw in [*RAW, "X0000000"]:
            self.assertNotIn(raw, masked)
        self.assertEqual(privacy.classified("Membership ID", "preauthorization"), "Required for the stated workflow")
        self.assertEqual(privacy.classified("Membership ID", "workflow-training"), "Requires staff review")

    def test_model_input_excludes_detected_values_and_preserves_eligible_evidence(self):
        names, content = main.model_source("Patient: Fictional Person\nPatient ID: ZZZZZ0000Z\n"
                                           "Provisional diagnosis: Fictional diagnosis\nEmail: aarav@example.invalid")
        self.assertEqual(names, ["Patient name", "Provisional diagnosis"])
        self.assertIn("Provisional diagnosis: Fictional diagnosis", content)
        self.assertNotIn("ZZZZZ0000Z", content)
        self.assertNotIn("aarav@example.invalid", content)

    def test_authorization_capture_review_original_and_summary(self):
        case = self.post_case()
        did = self.upload(case)
        suffix = f"/privacy/documents/{did}"
        authorization = self.client.get(case + "/privacy").json()["authorization"]
        self.assertEqual(authorization["noticeVersion"], privacy.NOTICE_VERSION)
        self.assertTrue(authorization["staffConfirmed"])
        self.assertTrue(authorization["confirmedAt"])
        self.assertNotIn("patientConsent", authorization)
        invalid = self.client.put(case + "/privacy/authorization", json={**AUTHORIZATION, "staffConfirmed": False})
        self.assertEqual(invalid.status_code, 422)
        invalid = self.client.put(case + "/privacy/authorization", json={**AUTHORIZATION, "staffConfirmed": 1})
        self.assertEqual(invalid.status_code, 422)
        invalid = self.client.put(case + "/privacy/authorization", json={**AUTHORIZATION, "noticeVersion": "unknown"})
        self.assertEqual(invalid.status_code, 422)

        masked = self.client.get(case + suffix)
        self.assertEqual(masked.status_code, 200)
        self.assertEqual(masked.json()["page"], 1)
        self.assertIn("Aarav Sharma", masked.json()["text"])
        self.assertEqual(sum(item["count"] for item in masked.json()["findings"]), 6)
        for raw in RAW:
            self.assertNotIn(raw, masked.text)
        self.assertEqual(self.client.get(case + suffix + "?page=2").status_code, 404)

        original = self.client.get(case + f"/documents/{did}/file")
        self.assertEqual(original.content, FIXTURE.read_bytes())
        recorded = self.client.put(case + suffix + "/review", json={"decision": "reviewed"})
        self.assertEqual(recorded.json()["decision"], "reviewed")
        packet = self.client.post(case + "/generate-packet")
        self.assertEqual(packet.status_code, 200)
        self.assertEqual(self.client.get(case + "/packet.pdf").status_code, 200)

        summary = self.client.get(case + "/privacy/summary")
        self.assertEqual(summary.status_code, 200)
        self.assertIn("attachment", summary.headers["Content-Disposition"])
        for raw in [*RAW, "Aarav Sharma", "fixture.pdf", "Fictional Privacy Test", self.token]:
            self.assertNotIn(raw, summary.text)
        result = summary.json()
        self.assertEqual(result["caseReference"], case.rsplit("/", 1)[-1])
        self.assertEqual(result["documents"][0]["staffReview"]["decision"], "reviewed")
        self.assertEqual(result["localAI"]["provider"], "mock")
        actions = {item["action"] for item in result["activity"]}
        self.assertTrue({"case.created", "document.uploaded", "privacy.document-reviewed",
                         "document.original-accessed", "packet.prepared", "packet.downloaded"}.issubset(actions))
        self.assertEqual(original.content, self.client.get(case + f"/documents/{did}/file").content)

    def test_auth_denials_and_metadata_exclude_inputs(self):
        first = self.post_case()
        other = self.post_case()
        did = self.upload(other)
        ids = (first.rsplit("/", 1)[-1], other.rsplit("/", 1)[-1])
        unauthorized_path = "/api/cases/diagnostic@example.invalid/privacy"
        credentials = "not-a-real-secret@example.invalid"
        records = []
        handler = logging.Handler()
        handler.emit = lambda record: records.append(record.getMessage())
        logger = logging.getLogger()
        logger.addHandler(handler)
        try:
            self.assertEqual(self.client.get(first + f"/privacy/documents/{did}").status_code, 404)
            self.assertEqual(self.client.put(first + f"/privacy/documents/{did}/review", json={"decision": "reviewed"}).status_code, 404)
            with TestClient(main.app) as anonymous:
                self.assertEqual(anonymous.get(unauthorized_path).status_code, 401)
                self.assertEqual(anonymous.get(other + "/privacy/summary").status_code, 401)
                self.assertEqual(anonymous.get(other + f"/documents/{did}/file").status_code, 401)
                self.assertEqual(anonymous.post("/api/auth/login", json={"accessKey": credentials}).status_code, 401)
            with closing(main.conn()) as conn, conn:
                conn.execute("update cases set owner_id='other-owner' where id=?", (ids[1],))
            self.assertEqual(self.client.get(other + "/privacy").status_code, 404)
            self.assertEqual(self.client.get(other + "/privacy/summary").status_code, 404)
            self.assertEqual(self.client.get(other + f"/documents/{did}/file").status_code, 404)
        finally:
            logger.removeHandler(handler)
        with closing(main.conn()) as conn:
            events = [dict(row) for row in conn.execute("select * from audit_events")]
        self.assertTrue(any(e["action"] == "auth.failed" and e["actor_id"] == "anonymous" for e in events))
        self.assertTrue(any(e["action"] == "access.denied" and e["outcome"] == "http-401" for e in events))
        for raw in [credentials, *RAW, self.token, "Fictional Privacy Test"]:
            self.assertNotIn(raw, json.dumps(events) + "\n".join(records))
        self.assertTrue(logging.getLogger("uvicorn.access").disabled)

    def test_retention_rights_and_complete_case_deletion(self):
        case = self.post_case()
        other = self.post_case()
        did = self.upload(case, pdf_bytes("Patient: Fictional Privacy Test\nAdmission date: 2026-11-26"))
        other_id = self.upload(other)
        request = self.client.post(case + "/privacy/requests", json={"kind": "erasure"})
        self.assertEqual(request.status_code, 200)
        rid = request.json()["id"]
        other_request = self.client.post(other + "/privacy/requests", json={"kind": "access"}).json()["id"]
        self.assertEqual(self.client.put(case + f"/privacy/requests/{other_request}", json={"status": "in-review"}).status_code, 404)
        self.assertEqual(self.client.put(case + f"/privacy/requests/{rid}", json={"status": "closed"}).status_code, 422)
        self.assertEqual(self.client.put(case + f"/privacy/requests/{rid}", json={"status": "closed", "outcome": "restricted"}).status_code, 200)
        self.assertEqual(self.client.get(case).status_code, 200)
        self.assertEqual(self.client.put(case + f"/privacy/documents/{did}/review", json={"decision": "follow-up-required"}).status_code, 200)
        self.client.post(case + "/process").raise_for_status()
        self.assertTrue(self.client.get(case + "/privacy").json()["lifecycle"]["lastProcessingAt"])

        future = (date.today() + timedelta(days=10)).isoformat()
        self.assertFalse(self.client.put(case + "/privacy/retention", json={"reviewDate": future, "legalHold": False}).json()["eligible"])
        self.assertEqual(self.client.delete(case).status_code, 409)
        self.assertEqual(self.client.delete(case + f"/documents/{did}").status_code, 409)
        self.client.put(case + "/privacy/retention", json={"reviewDate": None, "legalHold": True}).raise_for_status()
        self.assertEqual(self.client.delete(case).status_code, 409)
        self.assertEqual(self.client.put(case + "/privacy/retention", json={"reviewDate": None, "legalHold": False}).status_code, 409)
        self.client.put(case + "/privacy/retention", json={"reviewDate": None, "legalHold": False, "confirmHoldRelease": True}).raise_for_status()
        cid = case.rsplit("/", 1)[-1]
        with closing(main.conn()) as conn:
            original = Path(conn.execute("select stored from documents where id=?", (did,)).fetchone()[0])
        self.assertTrue(original.is_file())
        self.assertEqual(self.client.delete(case).json(), {"deleted": True, "cleanupPending": 0})
        self.assertFalse(original.exists())
        self.assertEqual(self.client.get(case + "/privacy").status_code, 404)
        self.assertEqual(self.client.get(other + f"/documents/{other_id}/file").status_code, 200)
        self.assertEqual(len(self.client.get(other + "/privacy").json()["requests"]), 1)
        with closing(main.conn()) as conn:
            for table in ("case_privacy", "privacy_requests", "document_privacy_reviews", "documents", "fields", "file_cleanup"):
                self.assertEqual(conn.execute(f"select count(*) from {table} where case_id=?", (cid,)).fetchone()[0], 0)
            events = conn.execute("select action from audit_events where case_id=?", (cid,)).fetchall()
        self.assertEqual([event[0] for event in events], ["case.deleted"])

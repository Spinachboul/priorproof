import io, os, tempfile, unittest
from pathlib import Path
from fastapi.testclient import TestClient

tmp = tempfile.TemporaryDirectory()
os.environ["DATABASE_PATH"] = str(Path(tmp.name) / "test.db")
os.environ["UPLOAD_DIR"] = str(Path(tmp.name) / "uploads")
os.environ["AI_PROVIDER"] = "mock"
from app.main import app


class WorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.client.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)
        tmp.cleanup()

    def test_demo_case_has_evidence_checklist_and_conflict(self):
        cases = self.client.get("/api/cases").json()
        self.assertTrue(cases)
        cid = cases[0]["id"]
        d = self.client.get(f"/api/cases/{cid}").json()
        self.assertTrue(any(x["evidence"] and x["source_doc"] for x in d["fields"]))
        self.assertTrue(any(x["status"] == "Missing" for x in d["checklist"]))
        self.assertTrue(d["conflicts"])
        for f in d["fields"]:
            if f["source_doc"]:
                ev = self.client.get(f'/api/cases/{cid}/evidence/{f["id"]}')
                self.assertEqual(ev.status_code, 200)
                self.assertIn(f["evidence"], ev.json()["sourceText"])

    def test_upload_rejects_executable_and_accepts_pdf(self):
        cid = self.client.get("/api/cases").json()[0]["id"]
        r = self.client.post(
            f"/api/cases/{cid}/documents",
            files=[("files", ("bad.exe", b"no", "application/octet-stream"))],
            data=[("categories", "Other supporting documents")],
        )
        self.assertEqual(r.status_code, 415)
        from reportlab.pdfgen import canvas

        b = io.BytesIO()
        p = canvas.Canvas(b)
        p.drawString(70, 700, "Patient: Mira Synthetic")
        p.save()
        r = self.client.post(
            f"/api/cases/{cid}/documents",
            files=[("files", ("test.pdf", b.getvalue(), "application/pdf"))],
            data=[("categories", "Admission notes")],
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["documents"][0]["pages"], 1)
        processed = self.client.post(f"/api/cases/{cid}/process")
        self.assertEqual(processed.status_code, 200)
        detail = self.client.get(f"/api/cases/{cid}").json()
        self.assertTrue(any(f["value"] == "Mira Synthetic" for f in detail["fields"]))

    def test_review_packet_ready_and_submission(self):
        cid = self.client.get("/api/cases").json()[0]["id"]
        d = self.client.get(f"/api/cases/{cid}").json()
        self.assertEqual(
            self.client.post(f"/api/cases/{cid}/ready", json={}).status_code, 409
        )
        for f in d["fields"]:
            self.client.put(
                f'/api/cases/{cid}/review/{f["id"]}', json={"review": "Verified"}
            )
        self.assertEqual(
            self.client.post(
                f"/api/cases/{cid}/ready",
                json={
                    "overrideReason": "Resolved synthetic admission date conflict during demo review"
                },
            ).status_code,
            200,
        )
        p = self.client.post(f"/api/cases/{cid}/generate-packet")
        self.assertEqual(p.status_code, 200)
        pdf = self.client.get(p.json()["downloadUrl"])
        self.assertEqual(pdf.status_code, 200)
        self.assertTrue(pdf.content.startswith(b"%PDF"))
        s = self.client.post(f"/api/cases/{cid}/simulate-submission")
        self.assertEqual(s.status_code, 200)
        self.assertTrue(s.json()["reference"].startswith("DEMO-"))


if __name__ == "__main__":
    unittest.main()

import io
import logging
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pymupdf
from fastapi.testclient import TestClient
from PIL import Image
from reportlab.pdfgen import canvas

tmp = tempfile.TemporaryDirectory()
os.environ.update(
    DATABASE_PATH=str(Path(tmp.name) / "test.db"),
    UPLOAD_DIR=str(Path(tmp.name) / "uploads"),
    AI_PROVIDER="mock",
    DEMO_ACCESS_KEY="test-demo-key",
    CORS_ORIGINS="http://192.168.0.10:3000",
)

from app.main import app, conn, ExtractedField, validated_extraction


def pdf_bytes(*pages):
    output = io.BytesIO()
    writer = canvas.Canvas(output)
    for text in pages:
        cursor = writer.beginText(60, 700)
        cursor.textLines(text)
        writer.drawText(cursor)
        writer.showPage()
    writer.save()
    return output.getvalue()


class WorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        logging.getLogger("httpx").setLevel(logging.WARNING)
        cls.client = TestClient(app)
        cls.client.__enter__()
        response = cls.client.post("/api/auth/login", json={"accessKey": "test-demo-key"})
        response.raise_for_status()
        cls.client.headers["Authorization"] = "Bearer " + response.json()["token"]
        cls.anonymous = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)
        cls.anonymous.close()
        tmp.cleanup()

    def create_case(self, **data):
        response = self.client.post("/api/cases", json={"patientName": "Synthetic", **data})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["id"]

    def details(self, cid):
        response = self.client.get(f"/api/cases/{cid}")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def upload(self, cid, contents, category="Admission notes", name="sample.pdf"):
        return self.client.post(
            f"/api/cases/{cid}/documents",
            files={"files": (name, contents)},
            data={"categories": category},
        )

    def process(self, cid):
        response = self.client.post(f"/api/cases/{cid}/process")
        self.assertEqual(response.status_code, 200, response.text)
        return self.details(cid)

    def review(self, cid, field_id, status, **data):
        return self.client.put(
            f"/api/cases/{cid}/review/{field_id}", json={"review": status, **data},
        )

    def test_login_requires_configuration_and_rejects_wrong_or_malformed_keys(self):
        with patch.dict(os.environ, {"DEMO_ACCESS_KEY": "replace-with-a-long-random-local-key"}):
            self.assertEqual(self.anonymous.post("/api/auth/login", json={"accessKey": "x"}).status_code, 503)
        bad = self.anonymous.post("/api/auth/login", json={"accessKey": "é"})
        self.assertEqual(bad.status_code, 401)
        self.assertEqual(self.anonymous.get("/api/cases", headers={"Authorization": "Bearer malformed"}).status_code, 401)
        with patch("app.main.time.time", return_value=0):
            expired = self.anonymous.post("/api/auth/login", json={"accessKey": "test-demo-key"}).json()["token"]
        self.assertEqual(self.anonymous.get("/api/cases", headers={"Authorization": f"Bearer {expired}"}).status_code, 401)

    def test_cors_does_not_grant_case_access(self):
        origin = "http://192.168.0.10:3000"
        headers = {"Origin": origin, "Access-Control-Request-Method": "GET",
                   "Access-Control-Request-Headers": "Authorization"}
        preflight = self.anonymous.options("/api/cases", headers=headers)
        self.assertEqual(preflight.status_code, 200)
        self.assertEqual(preflight.headers["access-control-allow-origin"], origin)
        self.assertEqual(self.anonymous.options("/api/cases", headers={**headers, "Origin": "http://192.168.0.11:3000"}).status_code, 400)
        self.assertEqual(self.anonymous.get("/api/cases", headers={"Origin": origin}).status_code, 401)

    def test_case_and_downloads_require_owner(self):
        cid = self.create_case()
        did = self.upload(cid, pdf_bytes("Patient: Synthetic")).json()["documents"][0]["id"]
        fid = self.process(cid)["fields"][0]["id"]
        paths = [f"/api/cases/{cid}{suffix}" for suffix in (
            "", f"/documents/{did}/file", f"/evidence/{fid}", "/packet.pdf",
        )]
        for path in paths:
            with self.subTest(path=path):
                self.assertEqual(self.anonymous.get(path).status_code, 401)
        file = self.client.get(paths[1])
        self.assertEqual(file.status_code, 200)
        self.assertEqual(file.headers["cache-control"], "no-store")
        self.assertIn("attachment;", file.headers["content-disposition"])
        other = self.create_case(patientName="Other")
        self.assertEqual(self.client.get(f"/api/cases/{other}/documents/{did}/file").status_code, 404)
        self.assertEqual(self.client.get(f"/api/cases/{other}/evidence/{fid}").status_code, 404)
        with conn() as db:
            db.execute("update cases set owner_id='another-demo-user' where id=?", (cid,))
        self.assertNotIn(cid, {row["id"] for row in self.client.get("/api/cases").json()})
        for path in paths:
            self.assertEqual(self.client.get(path).status_code, 404)
        self.assertEqual(self.client.delete(f"/api/cases/{cid}/documents/{did}").status_code, 404)
        self.assertEqual(self.client.post(f"/api/cases/{cid}/process").status_code, 404)
        self.assertEqual(self.upload(cid, pdf_bytes("Patient: Other")).status_code, 404)

    def test_download_rejects_path_outside_storage(self):
        cid = self.create_case()
        did = self.upload(cid, pdf_bytes("Patient: Synthetic")).json()["documents"][0]["id"]
        with conn() as db:
            db.execute("update documents set stored=? where id=?", (__file__, did))
        self.assertEqual(self.client.get(f"/api/cases/{cid}/documents/{did}/file").status_code, 404)

    def test_upload_rejects_invalid_files_and_rolls_back_batch(self):
        cid = self.create_case()
        self.assertEqual(self.upload(cid, b"no", name="bad.exe").status_code, 415)
        self.assertEqual(self.upload(cid, b"not pdf").status_code, 415)
        self.assertEqual(self.upload(cid, b"%PDF-1.4\ninvalid").status_code, 400)
        self.assertEqual(self.upload(cid, pdf_bytes("Patient: Synthetic"), category="wrong").status_code, 400)
        files_before = set(Path(os.environ["UPLOAD_DIR"]).iterdir())
        response = self.client.post(
            f"/api/cases/{cid}/documents",
            files=[("files", ("valid.pdf", pdf_bytes("Patient: Synthetic"))),
                   ("files", ("bad.png", b"\x89PNG\r\n\x1a\ninvalid"))],
            data={"categories": ["Admission notes", "Other supporting documents"]},
        )
        self.assertEqual(response.status_code, 400, response.text)
        self.assertEqual(self.details(cid)["documents"], [])
        self.assertEqual(set(Path(os.environ["UPLOAD_DIR"]).iterdir()), files_before)
        with patch("app.main.MAX_BYTES", 25):
            self.assertEqual(self.upload(cid, pdf_bytes("Patient: Synthetic")).status_code, 413)

    def test_policy_does_not_satisfy_insurance_identification(self):
        cid = self.create_case()
        def status():
            return next(row["status"] for row in self.details(cid)["checklist"]
                        if row["requirement"] == "Insurance identification")
        self.assertEqual(self.upload(cid, pdf_bytes("Fictional policy"), "Insurance policy").status_code, 200)
        self.assertEqual(status(), "Missing")
        self.assertEqual(self.upload(cid, pdf_bytes("Member: Synthetic"), "Insurance identification").status_code, 200)
        self.assertEqual(status(), "Available")

    def test_seed_contains_source_evidence_and_deliberate_conflict(self):
        case = next(item for item in self.client.get("/api/cases").json() if item["patientName"] == "Aarav Sharma")
        detail = self.details(case["id"])
        self.assertTrue(detail["conflicts"])
        for field in detail["fields"]:
            response = self.client.get(f"/api/cases/{case['id']}/evidence/{field['id']}")
            self.assertEqual(response.status_code, 200)
            self.assertIn(field["evidence"], response.json()["sourceText"])

    def test_reprocessing_preserves_verified_edited_rejected_manual_and_pending_fields(self):
        cid = self.create_case()
        source = pdf_bytes("Patient: Mira Synthetic\nAge: 34 years\nGender: Female\nPatient ID: DEMO-123")
        self.assertEqual(self.upload(cid, source).status_code, 200)
        fields = {row["name"]: row for row in self.process(cid)["fields"]}
        self.assertEqual(self.review(cid, fields["Patient name"]["id"], "Verified").status_code, 200)
        self.assertEqual(self.review(cid, fields["Age"]["id"], "Edited", value="35 years").status_code, 200)
        self.assertEqual(self.review(cid, fields["Gender"]["id"], "Rejected").status_code, 200)
        self.assertEqual(self.client.post(f"/api/cases/{cid}/fields", json={"name": "Symptoms", "value": "Staff entry"}).status_code, 200)
        expected = self.details(cid)["fields"]
        self.assertEqual(self.process(cid)["fields"], expected)
        self.assertEqual(self.process(cid)["fields"], expected)
        age = next(row for row in expected if row["name"] == "Age")
        self.assertEqual((age["original"], age["value"], age["origin"]), ("34 years", "35 years", "Edited by staff"))

    def test_processing_state_blocks_parallel_queue_and_mutations(self):
        cid = self.create_case()
        self.upload(cid, pdf_bytes("Patient: Synthetic")).raise_for_status()
        with patch("app.main.process_case_safely") as runner:
            self.assertEqual(self.client.post(f"/api/cases/{cid}/process").status_code, 200)
            self.assertEqual(self.client.post(f"/api/cases/{cid}/process").status_code, 200)
            runner.assert_called_once_with(cid)
        self.assertEqual(self.client.post(f"/api/cases/{cid}/ready", json={"overrideReason": "override"}).status_code, 409)
        self.assertEqual(self.client.get(f"/api/cases/{cid}/packet.pdf").status_code, 409)

    def test_provider_failure_preserves_existing_fields_and_sets_failure(self):
        cid = self.create_case()
        self.upload(cid, pdf_bytes("Patient: Source Synthetic")).raise_for_status()
        previous = self.process(cid)["fields"]
        with patch.dict(os.environ, {"AI_PROVIDER": "ollama"}), patch("app.main.ollama_extract", side_effect=RuntimeError("local model unavailable")):
            detail = self.process(cid)
        self.assertEqual(detail["status"], "Processing Failed")
        self.assertEqual(detail["fields"], previous)

    def test_evidence_rejects_unquoted_values_and_returns_correct_page(self):
        field = ExtractedField(group="Patient information", name="Age", value="34", evidence="Age: 134 years")
        self.assertIsNone(validated_extraction(field, "Age: 134 years"))
        field.evidence = "Age: 34"
        self.assertIsNone(validated_extraction(field, "Age: 134 years"))
        cid = self.create_case()
        self.upload(cid, pdf_bytes("First page", "[99] A literal marker in the document\nAge: 34 years")).raise_for_status()
        field = self.process(cid)["fields"][0]
        evidence = self.client.get(f"/api/cases/{cid}/evidence/{field['id']}").json()
        self.assertEqual(evidence["page"], 2)
        self.assertIn("Age: 34 years", evidence["sourceText"])
        self.assertNotIn("First page", evidence["sourceText"])

    def test_legacy_pdf_page_markers_remain_readable(self):
        cid = self.create_case()
        did = self.upload(cid, pdf_bytes("First page", "Age: 34 years")).json()["documents"][0]["id"]
        with conn() as db:
            db.execute("update documents set text=? where id=?", ("[1] First page\n[2] Age: 34 years", did))
        field = self.process(cid)["fields"][0]
        self.assertEqual(field["page"], 2)
        self.assertEqual(self.client.get(f"/api/cases/{cid}/evidence/{field['id']}").json()["sourceText"], "Age: 34 years")

    def test_conflicts_group_equivalent_dates_and_keep_different_verified_values_open(self):
        cid = self.create_case()
        for value in ("26 November 2026", "2026-11-26", "27 November 2026"):
            self.client.post(f"/api/cases/{cid}/fields", json={"name": " admission DATE ", "value": value}).raise_for_status()
        first, same, other = self.details(cid)["fields"]
        self.assertTrue(self.details(cid)["conflicts"])
        self.review(cid, other["id"], "Unreviewed").raise_for_status()
        self.assertEqual(self.details(cid)["conflicts"], [])
        self.review(cid, other["id"], "Verified").raise_for_status()
        self.assertTrue(self.details(cid)["conflicts"])
        self.review(cid, other["id"], "Rejected").raise_for_status()
        self.assertEqual(self.details(cid)["conflicts"], [])
        self.assertEqual(self.review(cid, first["id"], "Verified", value=" ").status_code, 422)
        self.assertEqual(self.review(cid, same["id"], "Verified", value="Other date").status_code, 422)

    def test_ocr_failure_keeps_upload_and_does_not_invent_fields(self):
        image = io.BytesIO()
        Image.new("RGB", (10, 10), "white").save(image, format="PNG")
        cid = self.create_case()
        with patch("pytesseract.image_to_string", side_effect=RuntimeError("Tesseract timeout")):
            response = self.upload(cid, image.getvalue(), "Other supporting documents", "camera.png")
        self.assertEqual(response.status_code, 200)
        self.assertIn("OCR failed", response.json()["documents"][0]["status"])
        detail = self.process(cid)
        self.assertEqual(detail["status"], "Missing Information")
        self.assertEqual(detail["fields"], [])

    def test_pdf_is_parseable_current_and_records_the_review_and_override(self):
        cid = self.create_case(patientName="Mira <Synthetic> & Family", age=0, estimatedCost=0)
        self.upload(cid, pdf_bytes("Patient: Mira Synthetic")).raise_for_status()
        field = self.process(cid)["fields"][0]
        self.assertEqual(self.client.post(f"/api/cases/{cid}/ready", json={}).status_code, 409)
        self.review(cid, field["id"], "Edited", value="Mira Corrected").raise_for_status()
        self.client.post(f"/api/cases/{cid}/ready", json={"overrideReason": "Fictional missing items"}).raise_for_status()
        packet = self.client.post(f"/api/cases/{cid}/generate-packet")
        packet.raise_for_status()
        download = self.client.get(packet.json()["downloadUrl"])
        self.assertEqual(download.headers["content-type"], "application/pdf")
        self.assertIn("attachment;", download.headers["content-disposition"])
        with pymupdf.open(stream=download.content, filetype="pdf") as doc:
            text = "\n".join(page.get_text() for page in doc)
        for expected in ("Mira <Synthetic> & Family", "Mira Corrected", "Originally extracted: Mira Synthetic",
                         "Insurance identification: Missing", "Staff override: Fictional missing items",
                         "INR 0.0", "PriorProof draft | Page 1"):
            self.assertIn(expected, text)
        self.review(cid, field["id"], "Rejected").raise_for_status()
        self.assertEqual(self.client.post(f"/api/cases/{cid}/simulate-submission").status_code, 409)
        current = self.client.get(packet.json()["downloadUrl"])
        with pymupdf.open(stream=current.content, filetype="pdf") as doc:
            text = "\n".join(page.get_text() for page in doc)
        self.assertIn("Rejected", text)
        self.assertNotIn("Staff override", text)
        self.client.post(f"/api/cases/{cid}/ready", json={"overrideReason": "Demo"}).raise_for_status()
        submission = self.client.post(f"/api/cases/{cid}/simulate-submission")
        self.assertTrue(submission.json()["reference"].startswith("DEMO-"))


if __name__ == "__main__":
    unittest.main()

"""Evaluate the production case endpoints with isolated SQLite and upload storage."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import platform
import shutil
import statistics
import subprocess
import sys
from tempfile import TemporaryDirectory
import time
from zipfile import ZipFile

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FIXTURES = ROOT / "public/evaluation/synthetic-cases.zip"


def ratio(numerator, denominator):
    return round(numerator / denominator, 4) if denominator else None


def classification(tp, fp, fn):
    return dict(tp=tp, fp=fp, fn=fn, precision=ratio(tp, tp + fp),
                recall=ratio(tp, tp + fn), f1=ratio(2 * tp, 2 * tp + fp + fn))


def compare(expected, actual):
    return (len(expected & actual), len(actual - expected), len(expected - actual))


def hardware():
    cpu = platform.processor() or platform.machine()
    if Path("/proc/cpuinfo").is_file():
        cpu = next((line.partition(":")[2].strip() for line in Path("/proc/cpuinfo").read_text().splitlines()
                    if line.startswith("model name")), cpu)
    gpu = None
    if shutil.which("nvidia-smi"):
        try:
            gpu = subprocess.check_output(
                ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
                text=True, timeout=5,
            ).strip()
        except (OSError, subprocess.SubprocessError):
            pass
    return dict(cpu=cpu, logicalCores=os.cpu_count(), gpu=gpu, platform=f"{platform.system()} {platform.machine()}")


def run(args, workdir):
    os.environ.update(DATABASE_PATH=str(workdir / "evaluation.db"), UPLOAD_DIR=str(workdir / "uploads"),
                      AI_PROVIDER=args.provider, OLLAMA_MODEL=args.model,
                      DEMO_ACCESS_KEY="internal-synthetic-benchmark-key")
    sys.path.insert(0, str(ROOT / "backend"))
    from app import main

    logging.getLogger("httpx").setLevel(logging.WARNING)
    model_times = []
    if args.provider == "ollama":
        inference = main.ollama_extract

        def measured_inference(text):
            start = time.perf_counter()
            try:
                return inference(text)
            finally:
                model_times.append((time.perf_counter() - start) * 1000)

        main.ollama_extract = measured_inference

    totals = Counter()
    cases = []
    with ZipFile(args.fixtures) as archive, TestClient(main.app) as client:
        login = client.post("/api/auth/login", json={"accessKey": os.environ["DEMO_ACCESS_KEY"]})
        login.raise_for_status()
        client.headers["Authorization"] = "Bearer " + login.json()["token"]
        for expected_file in sorted(n for n in archive.namelist() if n.startswith("expected/") and n.endswith(".json")):
            expected = json.loads(archive.read(expected_file))
            key = expected["id"]
            if args.case and key not in args.case:
                continue
            case_id = client.post("/api/cases", json={"patientName": f"Evaluation {key}"}).json()["id"]
            model_offset = len(model_times)
            start = time.perf_counter()
            response = client.post(
                f"/api/cases/{case_id}/documents",
                files=[("files", (doc["file"], archive.read(f'documents/{key}/{doc["file"]}'), "application/pdf"))
                       for doc in expected["documents"]],
                data={"categories": [doc["category"] for doc in expected["documents"]]},
            )
            response.raise_for_status()
            client.post(f"/api/cases/{case_id}/process").raise_for_status()
            detail = client.get(f"/api/cases/{case_id}").json()
            elapsed = (time.perf_counter() - start) * 1000
            if detail["status"] == "Processing Failed":
                totals["processingFailures"] += 1

            def field_key(field):
                return (field["name"], main.field_value_key(field["name"], field["value"]))

            expected_keys = {field_key(field) for field in expected["fields"]}
            actual_keys = {field_key(field) for field in detail["fields"]}
            allowed_sources = {(field_key(field), field["file"], field["page"], main.normalized(field["quote"]))
                               for field in expected["fields"]}
            evidence_correct = 0
            for field in detail["fields"]:
                response = client.get(f'/api/cases/{case_id}/evidence/{field["id"]}')
                response.raise_for_status()
                quote = field["evidence"]
                evidence = response.json()
                if quote and quote in evidence["sourceText"] and any(
                    (field_key(field), evidence["filename"], evidence["page"], main.normalized(line)) in allowed_sources
                    for line in quote.splitlines()
                ):
                    evidence_correct += 1

            missing = {row["requirement"] for row in detail["checklist"] if row["status"] == "Missing"}
            conflicts = {row["field"] for row in detail["conflicts"]}
            field_counts = compare(expected_keys, actual_keys)
            missing_counts = compare(set(expected["missingDocuments"]), missing)
            conflict_counts = compare(set(expected["conflicts"]), conflicts)
            for prefix, counts in (("fields", field_counts), ("missing", missing_counts), ("conflicts", conflict_counts)):
                for label, count in zip(("tp", "fp", "fn"), counts):
                    totals[prefix + label] += count
            warnings = [doc for doc in detail["documents"] if "readable text" in doc["status"] or "OCR failed" in doc["status"]]
            ocr_fails = 0
            unreadable_pages = 0
            for doc in warnings:
                status = doc["status"]
                if "OCR failed on " in status:
                    ocr_fails += int(status.split("OCR failed on ", 1)[1].split()[0])
                unreadable_pages += doc["pages"] if status.startswith("Uploaded") else int(status.split(" — ", 1)[1].split()[0])
            totals.update(citations=len(detail["fields"]), correctCitations=evidence_correct,
                          unsupported=len(detail["fields"]) - evidence_correct,
                          rejectedSlots=len(detail["unsupportedProposals"]), ocrFailedPages=ocr_fails,
                          unreadablePages=unreadable_pages)
            cases.append(dict(
                id=key, scenario=expected["scenario"], status=detail["status"], elapsedMs=round(elapsed, 2),
                modelMs=round(sum(model_times[model_offset:]), 2) if args.provider == "ollama" else None,
                fields=classification(*field_counts), evidenceCorrect=evidence_correct, citations=len(detail["fields"]),
                rejectedSlots=len(detail["unsupportedProposals"]), ocrFailedPages=ocr_fails, unreadablePages=unreadable_pages,
                detectedMissing=sorted(missing), detectedConflicts=sorted(conflicts),
                missedFields=sorted(name for name, _ in expected_keys - actual_keys),
                missedDocuments=sorted(set(expected["missingDocuments"]) - missing),
                missedConflicts=sorted(set(expected["conflicts"]) - conflicts),
                actualFields=[{key: field[key] for key in ("name", "value", "source_name", "page", "evidence")}
                              for field in detail["fields"]],
            ))
            print(f"{key}: {detail['status']}, {elapsed / 1000:.2f}s", flush=True)
    if not cases:
        raise ValueError("No fixture matched the supplied case filters")
    runtime_hardware = hardware()
    if args.provider == "ollama":
        import requests
        try:
            with requests.Session() as session:
                session.trust_env = False
                result = session.get(main.ollama_base() + "/api/ps", timeout=3, allow_redirects=False)
                result.raise_for_status()
                loaded = next((item for item in result.json()["models"] if item["name"] == args.model), None)
                if loaded and "size_vram" in loaded:
                    runtime_hardware["ollamaVramBytes"] = loaded["size_vram"]
        except (ValueError, KeyError, requests.RequestException):
            pass
    return dict(
        provider=args.provider, model=args.model if args.provider == "ollama" else None,
        timestamp=datetime.now(timezone.utc).isoformat(), hardware=runtime_hardware, casesEvaluated=len(cases), fixtureSubset=args.case,
        meanCaseLatencyMs=round(statistics.mean(case["elapsedMs"] for case in cases), 2) if cases else None,
        meanModelCallMs=round(statistics.mean(model_times), 2) if model_times else None,
        modelCalls=len(model_times),
        modelTimeoutSeconds=main.ollama_timeout() if args.provider == "ollama" else None,
        fields=classification(*(totals["fields" + key] for key in ("tp", "fp", "fn"))),
        missingDocuments=classification(*(totals["missing" + key] for key in ("tp", "fp", "fn"))),
        conflicts=classification(*(totals["conflicts" + key] for key in ("tp", "fp", "fn"))),
        evidenceCorrect=totals["correctCitations"], citations=totals["citations"],
        evidenceCorrectness=ratio(totals["correctCitations"], totals["citations"]),
        unsupportedRate=ratio(totals["unsupported"], totals["citations"]),
        unsupported=totals["unsupported"], rejectedSlots=totals["rejectedSlots"],
        ocrFailedPages=totals["ocrFailedPages"], unreadablePages=totals["unreadablePages"],
        processingFailures=totals["processingFailures"], cases=cases,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--provider", choices=["mock", "ollama"], required=True)
    parser.add_argument("--model", default="qwen3:4b")
    parser.add_argument("--case", action="append", help="Evaluate only this fixture ID. Repeat for more cases.")
    parser.add_argument("--fixtures", type=Path, default=DEFAULT_FIXTURES, help="Synthetic fixtures only")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.fixtures.resolve() != DEFAULT_FIXTURES.resolve() and args.output is None:
        parser.error("Custom fixtures require an explicit output path")
    with TemporaryDirectory(prefix="priorproof-evaluation-") as directory:
        results = run(args, Path(directory))
    output = args.output or ROOT / f"public/evaluation/results-{args.provider}.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(results, indent=2) + "\n")
    print(f"Saved {results['casesEvaluated']} measured cases to {output}")


if __name__ == "__main__":
    main()

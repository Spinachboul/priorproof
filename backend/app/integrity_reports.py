"""Render approved claim reports in memory using the existing ReportLab dependency."""
from io import BytesIO
from xml.sax.saxutils import escape

from fastapi.responses import Response
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

from . import main

REPORT_TITLES = {
    "report": "Claim Integrity Report",
    "investigation": "Financial Discrepancy Investigation Packet",
    "patient-summary": "Patient Financial Summary",
}
MONEY_LABELS = {
    "estimate": "Estimated treatment cost", "authorization": "Recorded authorization",
    "authorization_gap": "Estimate-to-authorization difference", "bill": "Latest hospital bill",
    "adjustment": "Documented billing adjustment", "allowable": "Contractually allowable amount",
    "responsibility": "Verified patient responsibility", "expected": "Expected insurer reimbursement",
    "settlement": "Recorded insurer settlement advice", "received": "Confirmed insurer receipts",
    "variance": "Potential payment variance", "outstanding": "Outstanding insurer payment",
}


def money(paise):
    whole, fraction = divmod(abs(paise), 100)
    return f"{'-' if paise < 0 else ''}INR {whole:,}.{fraction:02d}"


def render(report, data, hospital, synthetic):
    patient = report == "patient-summary"
    title = REPORT_TITLES[report]
    styles = getSampleStyleSheet()
    story = []

    def add(text, style="BodyText"):
        story.append(Paragraph(escape(text), styles[style]))
        story.append(Spacer(1, 7))

    add(title, "Title")
    if synthetic:
        add("Fictional demonstration document")
    add(f"Hospital: {hospital}")
    add(f"Case reference: {data['caseReference']}")
    add(f"Prepared {main.now()} | Staff verified {data['review']['reviewedAt']} · {data['review']['reviewer']}")
    add("Current financial information", "Heading2")
    sources = {event["id"]: event for event in data["events"]}
    patient_keys = ("estimate", "authorization", "bill", "adjustment", "responsibility", "received")
    inquiry_keys = ("expected", "settlement", "received", "outstanding", "variance")
    values = data["amounts"]
    for name in (patient_keys if patient else inquiry_keys if report == "investigation" else MONEY_LABELS):
        item = values.get(name)
        label = MONEY_LABELS[name]
        if not item:
            if name in ("estimate", "authorization", "bill", "responsibility", "received"):
                add(f"{label}: Unknown. Staff still need to verify the supporting information.")
            continue
        event_labels = [f"{sources[ref]['label']} p. {sources[ref]['source']['page']}" for ref in item["evidence"]]
        add(f"{label}: {money(item['paise'])}. {item['origin']}. Evidence: {', '.join(event_labels)}.")
        if item["formula"]:
            add(f"Method: {item['formula']}.")
    if patient:
        add("The adjustment is a documented change to the bill. The insurer receipt is the payment the hospital has confirmed.")
        add("Recorded amounts may change as new verified information arrives. Staff investigate payer differences separately from your verified responsibility.")
    else:
        add("Authorization and claim lifecycle", "Heading2")
        for event in data["events"]:
            number = "; ".join(money(value) for value in event["amounts"].values())
            status = "Superseded" if event["superseded"] else event["verification"]
            add(f"{event['date']} · {event['label']} · {status}{' · ' + number if number else ''}.")
        if data["paymentHistory"]:
            add("Payment investigation history", "Heading2")
            for record in data["paymentHistory"]:
                label = f"{record['recordedAt']} · {record['status']}"
                if record["expected"] is not None and record["received"] is not None:
                    label += (f". Expected {money(record['expected'])}, receipts {money(record['received'])}, "
                              f"difference {money(record['expected'] - record['received'])}.")
                evidence = [f"{sources[ref]['label']} p. {sources[ref]['source']['page']}" for ref in record["evidence"]]
                add(f"{label} Evidence: {', '.join(evidence)}.")
        add(f"Payer profile: {data['profile']['name']} · {data['profile']['verified']}")
        for requirement in data["profile"]["requirements"]:
            add(requirement)
    add("Pending review and administrative actions", "Heading2")
    if not data["findings"]:
        add("The current evidence has no open finding under the configured checks.")
    for finding in data["findings"]:
        if patient:
            message = "Staff are reviewing a financial or administrative question."
            if finding["id"] in ("payment-variance", "outstanding-payment", "remittance-mismatch"):
                message = "The hospital is reviewing insurer payment information separately from the amount you owe."
            add(message)
        else:
            evidence = [f"{sources[ref]['label']} p. {sources[ref]['source']['page']}" for ref in finding["evidence"]]
            add(f"{finding['category']} · {finding['status']}. {finding['action']} Evidence: {', '.join(evidence)}.")
    add("This administrative explanation is subject to review. Final coverage remains with the insurer and final charges with the hospital.")
    output = BytesIO()
    SimpleDocTemplate(output, pagesize=A4).build(story)
    return Response(output.getvalue(), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="priorproof-{report}.pdf"'})

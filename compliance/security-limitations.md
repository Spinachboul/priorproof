# Draft security limitations

This demo has a single shared role, local SQLite and unencrypted files. It has no independent assessment for DPDP, HIPAA, ISO 27001 or ABDM. Wi-Fi HTTP lacks transport encryption. Local administrators and people with access to the filesystem can bypass API controls.

The extraction boundary accepts a conservative set of explicit field labels. Embedded directives cannot invoke tools, alter ownership or submit claims. Malicious text can still impersonate a legitimate record. Verify authorship and source integrity before relying on it. Model confidence is not a calibrated probability and is omitted from the user interface.

Checklist relationships are based on the category selected by staff. OCR and local models can miss legitimate information. The readiness score reflects document preparation under demo rules. Staff overrides remain explicit and activity logs are not tamper-evident.

Privacy screening is heuristic. It surfaces possible identifiers based on configured patterns and labels. Readability, OCR errors and context affect coverage. A masked text preview can retain undetected sensitive text and is unsuitable for public release. PriorProof does not redact the bytes or text layer of PDF originals. Ollama receives eligible labelled lines without detected sensitive patterns and can still receive patient names, clinical facts and other necessary evidence.

Production requires individual staff authentication, role-based permissions, trusted HTTPS, encryption at rest, hospital data processing agreements, independent security assessment, hospital-specific AI validation, incident response procedures, and approved privacy and retention policies. Keep a separate fictional database and upload directory when enabling demo credentials.

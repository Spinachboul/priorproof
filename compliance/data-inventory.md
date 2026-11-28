# Draft data inventory

| Data | Where stored | Access |
| --- | --- | --- |
| Case details and workflow state | SQLite cases | Authenticated demo owner |
| Original PDFs and images | Configured upload directory | Authenticated case download or local filesystem access |
| Page text, OCR status and categories | SQLite documents | API processing and authenticated case evidence |
| Fact values, source page and quote, provider, review | SQLite fields | Case owner and in-memory packet rendering |
| Excluded proposal labels | SQLite unsupported proposals | Case owner. Model-generated values and quotes are excluded |
| Session and case activity | SQLite audit events | Case owner for a live case. Local operator via SQLite |
| Deletion retry paths | SQLite file cleanup queue | Application and local operator |
| Bearer token | Browser tab session storage | That browser tab and its scripts |
| Packet exports | In-memory API response, then downloaded storage | Case owner and users with access to the exported copy |
| Synthetic fixtures and benchmark outputs | Public assets | Public. Generated separately from workspace records |

## Privacy records and exports

Case privacy records store controlled purpose, data category, intended recipient and recorded-basis codes, notice version, whether staff confirmed, a timestamp, and an actor reference. The application separately stores any retention review date and legal hold, per-document privacy decisions, and privacy requests with resolution status, reason code, timestamp and actor. Avoid entering identifiable information in filenames or case notes.

Configured deterministic detection runs on existing extracted page text. Finding categories and counts are computed on demand. The preview replaces detected spans with generic category markers. The JSON processing and privacy summary omits filenames, extracted text, patient fields, complete identifiers and session IDs. It includes pseudonymous case and event references. Original downloads and clinical packets remain authorized disclosures that may contain identifiers. The case deletion route removes the related application-managed privacy records.

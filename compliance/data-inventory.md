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

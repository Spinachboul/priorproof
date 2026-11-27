# Draft privacy notice

PriorProof is a fictional demonstration of hospital document preparation. Upload synthetic records exclusively. Staff enter case details, select document categories, and optionally connect a local Ollama instance. PriorProof stores the uploads, searchable OCR text, extracted values, review decisions, and case activity on the laptop.

The local Ollama service receives bounded, explicitly labelled source lines when enabled. The application disables model redirects and external endpoints. A browser on Wi-Fi sends data to the configured API. Plain HTTP exposes that traffic to anyone who can observe the network. Use loopback or a separately configured trusted HTTPS endpoint.

People running the demo may list, review, export, or remove cases belonging to the shared account. Local deletes do not erase an exported copy or a backup. Questions about a particular deployment should go to the person operating it.

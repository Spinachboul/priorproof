# Draft access control policy

The demo runs one shared actor account. Keep the access key private and rotate it between demonstrations. The API signs 12-hour bearer sessions with a process-local secret. Restarting the API invalidates the existing sessions. Sign-out clears the browser tab session. An already copied token remains valid until it expires or the process restarts.

Every case endpoint checks ownership and binds document and field identifiers to the requested case. Source downloads and packets pass the same checks. Browser CORS allows configured origins and has no role in authenticating requests.

Keep both servers on loopback unless a trusted Wi-Fi demo is needed. Prompt text has no permission to call routes or change authentication or readiness.

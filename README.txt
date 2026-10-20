SAGAS

Open index.html through an HTTP server.
Run: python3 serve.py
Then open http://localhost:8000/

Use localhost, not a LAN IP over plain HTTP. HTTPS is required for remote hosts.
Keep power-bootstrap.js and power-isolation-worker.js beside index.html.
Static localhost/HTTPS servers without isolation headers use the scoped startup worker.
Requested asset packages are cached in this game's browser Cache Storage and reused on reload.
The worker downloads no assets during installation. Each file read fetches only its indexed packages.
Production servers should send these headers directly:
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp

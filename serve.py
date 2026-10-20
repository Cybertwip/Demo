from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cache-Control', 'public, max-age=31536000, immutable' if self.path.split('?', 1)[0].endswith('.pwa') or '?v=' in self.path else 'no-cache')
        super().end_headers()

os.chdir(Path(__file__).resolve().parent)
print('Open http://localhost:8000/')
ThreadingHTTPServer(('127.0.0.1', 8000), Handler).serve_forever()

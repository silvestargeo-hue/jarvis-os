#!/usr/bin/env python3
"""Serve the JARVIS Chat app on http://localhost:8787 (Puter.js needs HTTP, not file://)."""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    with http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler) as srv:
        print(f"JARVIS CHAT // http://localhost:{PORT}")
        srv.serve_forever()

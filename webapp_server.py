#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Arian static dev server (stdlib only) â€” http://127.0.0.1:8080

Reconstructed 2026-09-17: the previous webapp_server.py in this folder had
been overwritten with a copy of index.html (HTML). This replacement
restores the documented behaviour from TASK.md:

  - serves repo root (index.html + js/css/png/webp/fa/...)
  - gzip for text assets when the client accepts it (min 400 bytes)
  - cache: js/css 1d, png/webp/woff2/ttf 7d immutable, index.html no-cache
  - SPA fallback: clean URLs (/feed, /dashboard, ...) -> index.html
  - 404.html fallback for unknown routes with an extension

Usage:
    python webapp_server.py            # 127.0.0.1:8080
    python webapp_server.py --port 8080
"""
import gzip
import mimetypes
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.getenv("BROILER_WEB_PORT", "8080"))

# Clean URLs from vercel.json rewrites -> index.html
SPA_ROUTES = {
    "/feed", "/dashboard", "/trial", "/farm", "/live", "/scenarios",
    "/device", "/methodology", "/env", "/science", "/workspace",
    "/about", "/products", "/404",
}

CACHE_1D = "public, max-age=86400"
CACHE_7D_IMMUTABLE = "public, max-age=604800, immutable"
NO_CACHE = "no-cache"

GZIP_TYPES = (
    ".js", ".css", ".json", ".svg", ".html", ".txt", ".xml", ".map",
)

# Never serve backend sources, logs, databases or secrets over HTTP —
# only the public frontend asset types below.
ALLOWED_EXTS = {
    ".html", ".css", ".js", ".json", ".svg", ".map", ".txt", ".xml",
    ".png", ".webp", ".jpg", ".jpeg", ".ico", ".woff", ".woff2",
    ".ttf", ".eot", ".otf",
}


def cache_for(path):
    _, ext = os.path.splitext(path.lower())
    if ext in (".png", ".webp", ".woff2", ".ttf", ".woff", ".jpg", ".jpeg", ".svg", ".ico"):
        return CACHE_7D_IMMUTABLE
    if ext in (".js", ".css"):
        return CACHE_1D
    if path.endswith("index.html") or path.endswith("404.html"):
        return NO_CACHE
    return CACHE_1D


class Handler(SimpleHTTPRequestHandler):
    server_version = "ArianStatic/1.8.74"

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        sys.stdout.write("[web] %s - %s\n" % (self.address_string(), fmt % args))
        sys.stdout.flush()

    def do_GET(self):
        self._serve(head_only=False)

    def do_HEAD(self):
        self._serve(head_only=True)

    def _serve(self, head_only):
        # strip query string
        raw = self.path.split("?", 1)[0].split("#", 1)[0]
        # normalize: /BroilerLab prefix (GitHub Pages base) -> /
        if raw == "/BroilerLab" or raw.startswith("/BroilerLab/"):
            raw = raw[len("/BroilerLab"):] or "/"
        if raw in SPA_ROUTES or (raw.startswith("/") and raw[1:] in ("dash",)):
            return self._send_file(os.path.join(ROOT, "index.html"), head_only)
        fs_path = os.path.normpath(os.path.join(ROOT, raw.lstrip("/").replace("/", os.sep)))
        # security: stay inside ROOT
        if os.path.commonpath([ROOT, fs_path]) != ROOT:
            return self._send_file(os.path.join(ROOT, "404.html"), head_only, code=404)
        if os.path.isdir(fs_path):
            idx = os.path.join(fs_path, "index.html")
            if os.path.isfile(idx):
                return self._send_file(idx, head_only)
            return self._send_file(os.path.join(ROOT, "index.html"), head_only)
        if os.path.isfile(fs_path):
            _, fext = os.path.splitext(fs_path.lower())
            _base = os.path.basename(fs_path)
            if (_base.startswith(".") or _base == "config.local.js"
                    or (fext and fext not in ALLOWED_EXTS)):
                return self._send_file(os.path.join(ROOT, "404.html"), head_only, code=404)
            return self._send_file(fs_path, head_only)
        # no extension -> SPA fallback (History-API deep links)
        _, ext = os.path.splitext(raw)
        if not ext:
            return self._send_file(os.path.join(ROOT, "index.html"), head_only)
        # unknown file with extension -> 404 page if present
        page404 = os.path.join(ROOT, "404.html")
        if os.path.isfile(page404):
            return self._send_file(page404, head_only, code=404)
        self.send_error(404, "Not found")

    def _send_file(self, fs_path, head_only, code=200):
        try:
            with open(fs_path, "rb") as f:
                data = f.read()
        except OSError:
            self.send_error(404, "Not found")
            return
        ctype, _ = mimetypes.guess_type(fs_path)
        if ctype is None:
            ctype = "application/octet-stream"
        if ctype.startswith("text/") or fs_path.endswith((".js", ".css", ".svg", ".json", ".map")):
            if ";" not in ctype:
                ctype += "; charset=utf-8"
        # manual overrides for font types mimetypes may miss
        if fs_path.endswith(".woff2"):
            ctype = "font/woff2"
        elif fs_path.endswith(".woff"):
            ctype = "font/woff"
        elif fs_path.endswith(".ttf"):
            ctype = "font/ttf"

        accept = self.headers.get("Accept-Encoding", "")
        _, ext = os.path.splitext(fs_path.lower())
        use_gzip = (
            not head_only
            and "gzip" in accept
            and ext in GZIP_TYPES
            and len(data) > 400
        )
        body = gzip.compress(data, compresslevel=6) if use_gzip else data

        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache_for(fs_path))
        if use_gzip:
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Vary", "Accept-Encoding")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if not head_only:
            self.wfile.write(body)


def main():
    port = PORT
    for i, a in enumerate(sys.argv[1:]):
        if a == "--port" and i + 1 < len(sys.argv[1:]):
            try:
                port = int(sys.argv[1:][i + 1])
            except ValueError:
                pass
        elif a.isdigit():
            port = int(a)
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("Arian frontend: http://127.0.0.1:%d  (root: %s)" % (port, ROOT))
    print("Clean URLs: /feed /dashboard /device /env ... -> index.html")
    print("Backend API expected at http://127.0.0.1:8755 (config.js auto-detects localhost)")
    print("Ctrl+C to stop.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

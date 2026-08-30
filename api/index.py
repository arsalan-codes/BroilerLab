"""Vercel serverless entrypoint — exposes the FastAPI app.

The backend package is VENDORED at api/backend/ (tracked in git) so the
function is self-contained no matter what Root Directory the Vercel project
uses. Import path: this file's own directory + api/backend/.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.join(_HERE, "backend")
for _p in (_HERE, _BACKEND):
    if _p not in sys.path:
        sys.path.insert(0, _p)

if not os.path.isfile(os.path.join(_BACKEND, "main.py")):
    raise RuntimeError("vendored backend missing at %s" % _BACKEND)

from main import app  # noqa: E402  — FastAPI ASGI app; Vercel Python runtime uses `app`

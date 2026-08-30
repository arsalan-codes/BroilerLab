"""Vercel serverless entrypoint — exposes the FastAPI app (backend/main.py).

Bundle layout on Vercel (Python runtime, includeFiles "backend/**"):
  /var/task/api/index.py   <- this file (__file__)
  /var/task/backend/*.py   <- backend package (via includeFiles glob)

Path math: dirname(dirname(api/index.py)) == project root == /var/task.
The explicit candidates below cover both root-relative and function-relative
layouts so a runtime change cannot silently break the import.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_CANDIDATES = [
    os.path.join(os.path.dirname(_HERE), "backend"),  # /var/task/backend
    os.path.join(_HERE, "backend"),                   # api/backend (belt & braces)
]
for _c in _CANDIDATES:
    if os.path.isdir(_c) and _c not in sys.path:
        sys.path.insert(0, _c)

if not any(os.path.isfile(os.path.join(p, "main.py")) for p in _CANDIDATES):
    raise RuntimeError(
        "backend package not bundled: looked in %s (includeFiles missing?)" % _CANDIDATES
    )

from main import app  # noqa: E402  — FastAPI ASGI app; Vercel Python runtime uses `app`

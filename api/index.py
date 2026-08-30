"""Vercel serverless entrypoint — exposes the FastAPI app (backend/main.py)."""
import os, sys
BACKEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
sys.path.insert(0, BACKEND_DIR)
from main import app  # FastAPI ASGI app — Vercel Python runtime uses `app`

"""Arian — centralized logging configuration (backend/logging_config.py)

Phase 8: single place that configures Python logging for the backend.

* Log level from env: BROILER_LOG_LEVEL (default: INFO)
* JSON lines for production when BROILER_LOG_JSON=1 (machine-parseable),
  human-readable otherwise (default in dev)
* Secret redaction helper — never put credentials into logs
* Contextual extra fields: app, request_id

Intentionally dependency-free (stdlib logging only) so it works on any host
(Vercel function, local uvicorn, docker). Sentry can later be attached here
without touching request handlers.
"""
from __future__ import annotations

import json
import logging
import os
import sys
import time
import uuid

# ── level ────────────────────────────────────────────────────────────────────
def _level() -> int:
    name = (os.getenv("BROILER_LOG_LEVEL", "") or "INFO").strip().upper()
    return getattr(logging, name, logging.INFO)


class _JsonFormatter(logging.Formatter):
    """Emit each record as one JSON object (safe for log drains)."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created))
            + f".{int(record.msecs):03d}Z",
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "app": "arian-backend",
        }
        # contextual extras attached via logging.LoggerAdapter / extra={}
        for key in ("request_id", "method", "path", "status", "duration_ms", "user_id"):
            val = getattr(record, key, None)
            if val is not None:
                payload[key] = val
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


class _HumanFormatter(logging.Formatter):
    """Compact, readable log line for local development."""

    def format(self, record: logging.LogRecord) -> str:
        rid = getattr(record, "request_id", "")
        base = f"{record.levelname:<7} {record.name} :: {record.getMessage()}"
        if rid:
            base = f"[{rid}] {base}"
        if record.exc_info:
            base += "\n" + self.formatException(record.exc_info)
        return base


def setup_logging() -> None:
    """Configure the root logger once (idempotent)."""
    root = logging.getLogger()
    if getattr(root, "_arian_configured", False):
        return
    root.setLevel(_level())
    # avoid duplicate handlers if setup called more than once
    for h in list(root.handlers):
        root.removeHandler(h)

    stream = logging.StreamHandler(sys.stdout)
    use_json = os.getenv("BROILER_LOG_JSON", "").strip() == "1"
    stream.setFormatter(_JsonFormatter() if use_json else _HumanFormatter())
    root.addHandler(stream)

    # uvicorn's loggers should follow the same level/handlers
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "sqlalchemy.engine"):
        lg = logging.getLogger(name)
        lg.handlers = []
        lg.propagate = True
    logging.getLogger("sqlalchemy.engine").setLevel(max(logging.WARNING, _level()))
    root._arian_configured = True  # type: ignore[attr-defined]


def get_logger(name: str) -> logging.Logger:
    """Logger with a request_id slot that callers can fill via extra={}."""
    return logging.getLogger(name)


def redact(text: str) -> str:
    """Scrub likely secrets before logging (URLs with creds, tokens, passwords)."""
    import re

    text = re.sub(r"(://)([^:@\s/]+):([^@\s/]+)@", r"\1***:***@", text)   # postgres://u:p@
    text = re.sub(r"(\bBearer\s+)[A-Za-z0-9._-]+", r"\1***", text)          # Authorization
    text = re.sub(r'("(?:password|old_password|new_password|token|secret)"\s*:\s*")[^"]+(")', r"\1***\2", text)
    return text


def new_request_id() -> str:
    return uuid.uuid4().hex[:12]

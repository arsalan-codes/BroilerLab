"""
BroilerLab Device Backend — configuration
PostgreSQL connection + runtime settings.
"""
import os, secrets

# PostgreSQL connection (running on port 5434 in dev to avoid clashing
# with the other local cluster on 5432)
DB_HOST = os.getenv("BROILER_DB_HOST", "127.0.0.1")
DB_PORT = int(os.getenv("BROILER_DB_PORT", "5434"))
DB_NAME = os.getenv("BROILER_DB_NAME", "broilerlab")
DB_USER = os.getenv("BROILER_DB_USER", "broiler")
DB_PASS = os.getenv("BROILER_DB_PASS", "")  # never commit real passwords — set BROILER_DB_PASS

# Full-URL override first (Vercel Postgres / Neon style), then discrete vars.
DATABASE_URL = (
    os.getenv("BROILER_DATABASE_URL")
    or os.getenv("POSTGRES_URL")
    or f"postgresql+psycopg://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)
# Provider URLs come as postgres:// or postgresql:// — SQLAlchemy+psycopg3
# needs the explicit +psycopg driver dialect (psycopg2 is NOT installed).
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)


def _prefer_ipv4(url: str) -> str:
    """Vercel lambdas may attempt IPv6 first and fail with 'Cannot assign
    requested address'. Resolve the A record and pass it via hostaddr so
    psycopg dials IPv4 while `host` still drives SNI/TLS verification."""
    if "hostaddr=" in url or "@" not in url:
        return url
    try:
        import socket
        from urllib.parse import urlsplit, urlunsplit, parse_qs, urlencode
        parts = urlsplit(url)
        host = parts.hostname
        if not host:
            return url
        infos = [i for i in socket.getaddrinfo(host, None, family=socket.AF_INET) if i[0] == socket.AF_INET]
        if not infos:
            return url
        ip = infos[0][4][0]
        q = parse_qs(parts.query)
        q["hostaddr"] = [ip]
        new_query = urlencode({k: v[-1] for k, v in q.items()})
        netloc = parts.netloc.replace(host, host, 1)  # keep host (SNI) intact
        return urlunsplit((parts.scheme, parts.netloc, parts.path, new_query, parts.fragment))
    except Exception:
        return url


DATABASE_URL = _prefer_ipv4(DATABASE_URL)

# MQTT — device publishes JSON telemetry to this topic prefix.
MQTT_BROKER = os.getenv("BROILER_MQTT_HOST", "127.0.0.1")
MQTT_PORT = int(os.getenv("BROILER_MQTT_PORT", "1883"))
MQTT_TOPIC_PREFIX = os.getenv("BROILER_MQTT_TOPIC", "broilerlab/device")

# Backend HTTP/WS listen
API_HOST = os.getenv("BROILER_API_HOST", "127.0.0.1")
API_PORT = int(os.getenv("BROILER_API_PORT", "8755"))

# Sensor noise model (used by the processing algorithm, matches docs)
RAW_WEIGHT_SIGMA = 4.0          # g, raw load-cell noise on platform scale
EMA_ALPHA = 0.35               # EMA smoothing factor for weight_g
BIN_REFILL_THRESHOLD_KG = 3.0  # auto-refill trigger
BIN_CAPACITY_KG = 25.0
VISIT_QUEUE_TIMEOUT_S = 90.0  # co-feeding give-up threshold

# ---- Auth / JWT ----
# No usable default in the repo: empty forces env var; dev-only fallback random per-boot.
JWT_SECRET = os.getenv("BROILER_JWT_SECRET") or ("dev-" + secrets.token_hex(16))
JWT_ALG = "HS256"
JWT_EXPIRE_MIN = int(__import__("os").getenv("BROILER_JWT_EXPIRE_MIN", "1440"))  # 24h

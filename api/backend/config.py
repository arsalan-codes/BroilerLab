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

# ---- Online device ingest (uktech weight API) ----
# The browser never sees these: the token stays server-side and the backend
# pulls https://<host>/Login/api_weight_data.php?serial=..&ttoken=.. itself.
UKTECH_API_BASE = os.getenv("UKTECH_API_BASE", "https://uktech.ir/Login/api_weight_data.php")
UKTECH_SERIAL = os.getenv("UKTECH_SERIAL", "ESP800")
UKTECH_TOKEN = os.getenv("UKTECH_API_TOKEN") or os.getenv("BROILER_UKTECH_TOKEN") or ""
UKTECH_TIMEOUT_S = int(os.getenv("UKTECH_TIMEOUT_S", "15"))
UKTECH_PAGE_SIZE = int(os.getenv("UKTECH_PAGE_SIZE", "200"))
UKTECH_MAX_PAGES = int(os.getenv("UKTECH_MAX_PAGES", "20"))
# TLS verification for the uktech host. Keep TRUE everywhere except hosts
# whose chain Python cannot verify (then set false explicitly + firewall).
UKTECH_VERIFY_SSL = (os.getenv("UKTECH_VERIFY_SSL", "true").lower() == "true")
# Local-dev auto poll (lifespan background task). Keep OFF on Vercel/serverless.
UKTECH_AUTO_POLL = (os.getenv("UKTECH_AUTO_POLL", "false").lower() == "true")
UKTECH_POLL_SECONDS = int(os.getenv("UKTECH_POLL_SECONDS", "120"))
UKTECH_CYCLE_ID = int(os.getenv("UKTECH_CYCLE_ID", "0") or 0)

# ---- Auth / JWT ----
# Explicit secret (production must set BROILER_JWT_SECRET — lifespan refuses to
# boot with an ephemeral key when BROILER_REQUIRE_JWT_SECRET=1 or on Vercel).
JWT_SECRET_EXPLICIT = bool(os.getenv("ARIAN_JWT_SECRET") or os.getenv("BROILER_JWT_SECRET"))


def _dev_secret() -> str:
    """Stable dev-only fallback: persisted to an untracked local file so login
    sessions survive backend restarts. Read-only filesystems (Vercel) fall back
    to an ephemeral key with no persistence (production must set the env var)."""
    try:
        here = os.path.dirname(os.path.abspath(__file__))
        path = os.path.join(here, ".dev_jwt_secret")
        if os.path.isfile(path):
            with open(path, "r", encoding="utf-8") as f:
                saved = f.read().strip()
            if saved:
                return saved
        fresh = "dev-" + secrets.token_hex(16)
        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write(fresh)
        except OSError:
            pass  # read-only host (serverless): ephemeral key for this boot
        return fresh
    except Exception:
        return "dev-" + secrets.token_hex(16)


JWT_SECRET = (os.getenv("ARIAN_JWT_SECRET") or os.getenv("BROILER_JWT_SECRET") or _dev_secret())
JWT_ALG = "HS256"
JWT_EXPIRE_MIN = int(__import__("os").getenv("ARIAN_JWT_EXPIRE_MIN") or os.getenv("BROILER_JWT_EXPIRE_MIN") or "1440")  # 24h

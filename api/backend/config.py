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
# Canonical env names are WEIGHT_API_TOKEN / WEIGHT_API_URL; the older
# UKTECH_* names keep working as fallbacks.
UKTECH_API_BASE = (os.getenv("WEIGHT_API_URL")
                   or os.getenv("UKTECH_API_BASE")
                   or "https://uktech.ir/Login/api_weight_data.php")
UKTECH_SERIAL = os.getenv("UKTECH_SERIAL", "ESP800")
UKTECH_TOKEN = (os.getenv("WEIGHT_API_TOKEN")
                or os.getenv("UKTECH_API_TOKEN")
                or os.getenv("BROILER_UKTECH_TOKEN") or "")
UKTECH_TIMEOUT_S = int(os.getenv("UKTECH_TIMEOUT_S", "15"))
UKTECH_PAGE_SIZE = int(os.getenv("UKTECH_PAGE_SIZE", "500"))
UKTECH_MAX_PAGES = int(os.getenv("UKTECH_MAX_PAGES", "20"))
# TLS verification for the uktech host: "true" (strict) / "false" (skip) /
# "auto" (default: try strict, fall back to unverified ONCE with a loud
# warning — the uktech host currently serves a self-signed chain, so strict
# by default would break sync out of the box; the fallback is surfaced in
# the sync summary so the admin always knows).
UKTECH_VERIFY_SSL = os.getenv("UKTECH_VERIFY_SSL", "auto").strip().lower()
# Local-dev auto poll (lifespan background task). Keep OFF on Vercel/serverless.
UKTECH_AUTO_POLL = (os.getenv("UKTECH_AUTO_POLL", "false").lower() == "true")
UKTECH_POLL_SECONDS = int(os.getenv("UKTECH_POLL_SECONDS", "120"))
UKTECH_CYCLE_ID = int(os.getenv("UKTECH_CYCLE_ID", "0") or 0)

# ---- Direct ESP32 device ingestion ----
# Per-device API keys (BLD_...) bound to one cycle each. No global device
# key exists by design: every ESP32 carries only its own credential.
DEVICE_INGEST_RATE_LIMIT = int(os.getenv("DEVICE_INGEST_RATE_LIMIT", "120"))
DEVICE_INGEST_RATE_WINDOW = int(os.getenv("DEVICE_INGEST_RATE_WINDOW", "60"))
DEVICE_ONLINE_SECONDS = int(os.getenv("DEVICE_ONLINE_SECONDS", "300"))
DEVICE_MAX_CLOCK_SKEW_S = int(os.getenv("DEVICE_MAX_CLOCK_SKEW_S", "300"))
DEVICE_MAX_BATCH = int(os.getenv("DEVICE_MAX_BATCH", "50"))
DEVICE_KEY_PREFIX = "BLD_"

# ---- Per-unit live core (process_unit_sample) ----
# Every API record carries TWO independent weighing units. Field mapping
# (owner-confirmed): unit 1 = rfid1 / bird weight_2 / bin weight_1 /
# status1 / cal_2 (bird) / cal_1 (bin); unit 2 mirrors on rfid2 /
# weight_4 / weight_3 / status2 / cal_4 / cal_3. total_weight is always
# the exact sum (profiled over 145 rows) and is ignored for logic.
# total_seconds has read 0.0 in every row ever observed: elapsed runs on
# the counter when it moves, falling back to record-timestamp spans.
UKTECH_EMPTY_THRESHOLD_G = float(os.getenv("UKTECH_EMPTY_THRESHOLD_G", "15"))
UKTECH_EMPTY_DEBOUNCE = int(os.getenv("UKTECH_EMPTY_DEBOUNCE", "2") or 2)
UKTECH_FEED_NOISE_G = float(os.getenv("UKTECH_FEED_NOISE_G", "0.5"))
# Canonical alias from the monitoring spec (§51); same knob, either name.
UKTECH_FEED_NOISE_THRESHOLD_G = float(
    os.getenv("UKTECH_FEED_NOISE_THRESHOLD_G",
              os.getenv("UKTECH_FEED_NOISE_G", "0.5")))
UKTECH_REFILL_JUMP_G = float(os.getenv("UKTECH_REFILL_JUMP_G", "50"))
# Tag swap with continuous weight: "keep-open" (reader flapping observed:
# 7 swaps in 20 records at constant weight) or "close-open".
UKTECH_RFID_SWAP_POLICY = os.getenv("UKTECH_RFID_SWAP_POLICY", "keep-open").strip().lower()
# A single-step bird-weight change larger than this (g) is the unloading
# slope (motor ejection: 219.9 -> 45 in seconds) or a glitch, not real
# weight change: the live weight freezes at the last plausible value.
UKTECH_BIRD_JUMP_G = float(os.getenv("UKTECH_BIRD_JUMP_G", "30"))
# INVALID lasting this many seconds of consecutive INVALID records = the
# motor has ejected the bird (owner rule): the visit finalizes as OUT
# (exit = invalid_since + window) in the same row. A lone flaky glitch
# plus an irregular gap never ejects a feeding bird.
UKTECH_INVALID_EJECT_S = float(os.getenv("UKTECH_INVALID_EJECT_S", "30"))
# Canonical alias from the monitoring spec (§51); same knob, either name.
EJECTION_TIMEOUT_SECONDS = float(
    os.getenv("EJECTION_TIMEOUT_SECONDS",
              os.getenv("UKTECH_INVALID_EJECT_S", "30")))
UKTECH_PAGES_PER_TICK = int(os.getenv("UKTECH_PAGES_PER_TICK", "4") or 4)
UKTECH_PRESENCE_TOL_S = float(os.getenv("UKTECH_PRESENCE_TOL_S", "30"))

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

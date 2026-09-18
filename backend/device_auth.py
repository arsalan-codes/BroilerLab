"""
BroilerLab — direct ESP32 device authentication (no human JWT).

Architecture (tenant isolation without trusting the firmware):

    ESP32 --HTTPS, X-Device-Key: BLD_...--> POST /api/device/ingest
        --> look up Device by key_prefix, verify SHA256(api_key)
        --> Device.active?  (else 403)
        --> cycle = Device.cycle  (the device NEVER selects a cycle;
            cycle_id/user_id/owner fields in the payload are rejected)
        --> validate timestamp + event_id
        --> external_id = "dev:" + sha256(device_id:event_id)[:48]
            (namespaced so device ids can never collide with uktech
            "<serial>:<id>" rows under the (cycle_id, external_id) unique
            constraint; retries hash identically -> idempotent)
        --> get_processor(cycle_id).ingest(...)  (existing pipeline:
            DeviceLog + Visit, same as the browser /ingest path)
        --> hub.publish(...) for the existing live UI
        --> update Device.last_seen_at / last_ip (+ firmware if sent)

Secrets: the raw key exists only in the create/rotate response. The DB
holds SHA256(key) — a 192-bit random secret, unbruteforceable if leaked.
Keys never appear in logs (only device_id / cycle_id / event_id).
Rate limiting is per-device, per-process best-effort (serverless-safe
wording: documented as a brake, not a global guarantee).
"""
import hashlib
import hmac
import re
import secrets

DEVICE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
EVENT_ID_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,128}$")
KEY_PREFIX_LEN = 12  # non-secret lookup shard: "BLD_" + 8 random chars


def generate_api_key(prefix: str = "BLD_") -> str:
    """One fresh device credential. ~192 bits of entropy."""
    return prefix + secrets.token_urlsafe(24)


def hash_api_key(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def key_prefix_of(raw: str) -> str:
    return (raw or "")[:KEY_PREFIX_LEN]


def verify_api_key(raw: str, stored_hash: str) -> bool:
    try:
        return hmac.compare_digest(hash_api_key(raw), stored_hash or "")
    except Exception:
        return False


def external_id_for(device_id: str, event_id: str) -> str:
    """Deterministic DeviceLog.external_id for a device event (<=64 chars)."""
    digest = hashlib.sha256(f"{device_id}:{event_id}".encode("utf-8")).hexdigest()
    return "dev:" + digest[:48]


def valid_device_id(value) -> bool:
    return isinstance(value, str) and bool(DEVICE_ID_RE.match(value.strip()))


def valid_event_id(value) -> bool:
    return isinstance(value, str) and bool(EVENT_ID_RE.match(value.strip()))


def extract_device_key(headers) -> str | None:
    """Canonical header only (never query params — they leak into logs).

    Accepts `X-Device-Key: <key>`; as a convenience also honors
    `Authorization: Bearer BLD_...` (human JWTs never carry the BLD_
    prefix, so the two credential spaces cannot be confused).
    """
    raw = (headers.get("x-device-key") or "").strip()
    if raw:
        return raw
    auth = (headers.get("authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        if token.startswith("BLD_"):
            return token
    return None

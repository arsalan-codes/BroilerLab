"""
BroilerLab Device Backend — SQLAlchemy models + PostgreSQL schema.

Entities:
  User      — account, owns cycles (row-level isolation via user_id)
  Cycle     — a rearing period, now owned by a User (user_id FK)
  Visit     — one feeding-station visit by one bird
  DeviceLog — raw per-event row from the hardware (12-col schema)
"""
from datetime import datetime, timezone
import os
from sqlalchemy import (
    create_engine, Column, Integer, String, Float, Boolean, DateTime,
    ForeignKey, Index, UniqueConstraint, inspect, text,
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

from config import DATABASE_URL

Base = declarative_base()


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    """Application user — owns cycles. Email is login identity."""
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String(160), unique=True, nullable=False, index=True)
    username = Column(String(60), unique=True, nullable=True, index=True)
    full_name = Column(String(120), nullable=True)
    hashed_password = Column(String(200), nullable=False)
    # Bumped on password change — JWTs carry this value, so old tokens die
    # with the old password (see auth.authenticate_token).
    token_version = Column(Integer, nullable=False, default=0, server_default="0")
    is_active = Column(Boolean, default=True, nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    last_login = Column(DateTime(timezone=True), nullable=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True)

    organization = relationship("Organization", back_populates="users")
    cycles = relationship("Cycle", back_populates="owner", cascade="all, delete-orphan")


class Organization(Base):
    __tablename__ = "organizations"
    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    users = relationship("User", back_populates="organization", cascade="all, delete-orphan")


class Cycle(Base):
    """A rearing period. Each cycle is owned by exactly one User."""
    __tablename__ = "cycles"
    __table_args__ = (
        # cycle_code is unique PER OWNER, not globally: one tenant must not
        # be able to probe or squat another tenant's codes (fail-closed 404
        # on duplicates within the same account instead).
        UniqueConstraint("user_id", "cycle_code", name="uq_cycle_user_code"),
    )
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    cycle_code = Column(String(32), nullable=False, index=True)
    label = Column(String(120), nullable=False)
    strain = Column(String(40), nullable=False, default="ross308")
    start_date = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    end_date = Column(DateTime(timezone=True), nullable=True)
    bird_count = Column(Integer, nullable=False, default=0)
    pen_id = Column(String(32), nullable=True)
    notes = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    active = Column(Boolean, default=True)

    owner = relationship("User", back_populates="cycles")
    visits = relationship("Visit", back_populates="cycle", cascade="all, delete-orphan")
    logs = relationship("DeviceLog", back_populates="cycle", cascade="all, delete-orphan")


class Visit(Base):
    __tablename__ = "visits"
    __table_args__ = (
        Index("ix_visit_cycle_bird", "cycle_id", "bird_id"),
        Index("ix_visit_start", "cycle_id", "visit_start"),
    )
    id = Column(Integer, primary_key=True)
    cycle_id = Column(Integer, ForeignKey("cycles.id", ondelete="CASCADE"), nullable=False)
    bird_id = Column(String(32), nullable=False)
    visit_start = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    visit_end = Column(DateTime(timezone=True), nullable=True)
    age_day = Column(Integer, nullable=True)
    initial_weight_g = Column(Float, nullable=True)
    final_weight_g = Column(Float, nullable=True)
    feed_intake_g = Column(Float, nullable=True)
    # Device-reported presence seconds, accumulated by the hardware until the
    # bird exits (uktech total_seconds). Set on visit close; NULL while open.
    presence_s = Column(Float, nullable=True)
    # Weighing-unit lane (uktech two-unit records: 1 or 2). HTTP-ingest and
    # legacy rows default to 1 (single-unit devices); NULL only predates it.
    unit = Column(Integer, nullable=True, index=True)
    sensor_id = Column(String(32), nullable=True)
    rssi = Column(Float, nullable=True)
    read_ok = Column(Boolean, default=True)
    co_feed = Column(Boolean, default=False)
    temp_c = Column(Float, nullable=True)
    humidity = Column(Float, nullable=True)
    cycle = relationship("Cycle", back_populates="visits")


class DeviceLog(Base):
    __tablename__ = "device_logs"
    id = Column(Integer, primary_key=True)
    cycle_id = Column(Integer, ForeignKey("cycles.id", ondelete="CASCADE"), nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False)
    flock_id = Column(String(32), nullable=True)
    bird_id = Column(String(32), nullable=True)
    sensor_id = Column(String(32), nullable=True)
    age_day = Column(Integer, nullable=True)
    raw_weight_g = Column(Float, nullable=True)
    weight_g = Column(Float, nullable=True)
    feed_bin_kg = Column(Float, nullable=True)
    feed_delta_g = Column(Float, nullable=True)
    temp_c = Column(Float, nullable=True)
    humidity = Column(Float, nullable=True)
    rssi = Column(Float, nullable=True)
    visit_id = Column(Integer, ForeignKey("visits.id", ondelete="SET NULL"), nullable=True)
    is_visit_start = Column(Boolean, default=False)
    is_visit_end = Column(Boolean, default=False)
    # Raw upstream per-unit validation flag (status1/status2) as sent. Stored
    # for debugging only — it is flaky (identical payloads arrive VALID and
    # INVALID) and must NEVER gate session/visit decisions.
    status = Column(String(16), nullable=True)
    # Online-ingest idempotency: "<serial>:<remote id>" (e.g. "ESP800:1039").
    # NULL for manually ingested rows; unique per cycle so a re-sync never
    # duplicates rows.
    external_id = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    cycle = relationship("Cycle", back_populates="logs")
    __table_args__ = (
        Index("ix_log_cycle_ts", "cycle_id", "timestamp"),
        Index("uq_log_cycle_external", "cycle_id", "external_id", unique=True),
    )


class EnvSample(Base):
    """One MQTT telemetry row from the climate-control hardware.

    Narrow row (all sensor values in one message = one insert): the broker
    publishes the full house snapshot at ~1 Hz, so batched single-table
    inserts with a (house_id, ts) covering index keep ingest at O(1) per
    message with no join on read. house_id scopes ownership via Cycle.
    """
    __tablename__ = "env_samples"
    id = Column(Integer, primary_key=True)
    house_id = Column(Integer, nullable=False, index=True)
    ts = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    temp_c = Column(Float, nullable=True)
    rh = Column(Float, nullable=True)
    bed_rh = Column(Float, nullable=True)
    feed_kg = Column(Float, nullable=True)
    water_l = Column(Float, nullable=True)
    nh3_ppm = Column(Float, nullable=True)
    o2_pct = Column(Float, nullable=True)
    fan_pct = Column(Float, nullable=True)
    light_lux = Column(Float, nullable=True)
    rssi = Column(Float, nullable=True)
    health_json = Column(String(500), nullable=True)
    __table_args__ = (
        Index("ix_env_house_ts", "house_id", "ts"),
    )


class SyncState(Base):
    """Incremental-sync cursor per upstream source (e.g. "uktech:ESP800").

    last_id tracks the highest remote record id already ingested, so each
    sync only fetches newer rows. No FK: cursors outlive any single cycle.
    """
    __tablename__ = "sync_state"
    key = Column(String(120), primary_key=True)
    last_id = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    note = Column(String(200), nullable=True)


class WeighingSession(Base):
    """Weighing-session state per (serial, cycle, device, rfid) lane.

    Persists the weighing.py state machine across sync calls (serverless
    processes are stateless between invocations). Key format
    "<serial>|<cycle_id>|<device>|<rfid>" (see weighing.session_key).
    visit_id points at the visit created for the registered event (if any).
    """
    __tablename__ = "weighing_sessions"
    key = Column(String(160), primary_key=True)
    serial = Column(String(32), nullable=False, index=True)
    cycle_id = Column(Integer, ForeignKey("cycles.id", ondelete="CASCADE"),
                      nullable=False, index=True)
    device_id = Column(String(32), nullable=True)
    rfid = Column(String(32), nullable=True)
    state = Column(String(20), nullable=False, default="EMPTY")
    candidate = Column(Float, nullable=True)
    stable_count = Column(Integer, nullable=False, default=0)
    zero_count = Column(Integer, nullable=False, default=0)
    registered = Column(Float, nullable=True)
    visit_id = Column(Integer, nullable=True)
    first_ts = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def _run_alembic_upgrade():
    """Apply schema migrations via Alembic (production path)."""
    import os
    from sqlalchemy.engine import make_url
    here = os.path.dirname(os.path.abspath(__file__))
    # candidate roots: repo root (dev) and the function dir (Vercel may flatten includeFiles here)
    roots = [os.path.dirname(os.path.dirname(here)), os.path.dirname(here), here]
    base = next((r for r in roots
                 if os.path.isfile(os.path.join(r, "alembic.ini"))
                 and os.path.isdir(os.path.join(r, "migrations"))), roots[0])
    os.environ.setdefault("ALEMBIC_CONFIG", os.path.join(base, "alembic.ini"))
    from alembic.config import Config
    from alembic import command
    cfg = Config(os.environ.get("ALEMBIC_CONFIG"))
    cfg.set_main_option("script_location", os.path.join(base, "migrations"))
    cfg.set_main_option("prepend_sys_path", os.path.join(base, "backend"))
    cfg.set_main_option("sqlalchemy.url", DATABASE_URL)
    command.upgrade(cfg, "head")


def init_db():
    """Create tables if missing + keep schema under migrations.

    - Production (BROILER_DB_MIGRATE=alembic): applies Alembic migrations
      (no destructive recreation, no data loss).
    - Local/dev default: idempotent create_all for a zero-friction boot.
    """
    mig = os.getenv("ARIAN_DB_MIGRATE") or os.getenv("BROILER_DB_MIGRATE")
    if (mig or "").lower() == "alembic":
        _run_alembic_upgrade()
        return
    Base.metadata.create_all(engine)
    # --- ad-hoc migrations for dev (create_all) databases -----------------
    # Alembic-managed production DBs get these via migrations/004 + 005.
    # Dialect-agnostic via the inspector so sqlite dev DBs migrate too.
    try:
        insp = inspect(engine)
        cycle_cols = {c["name"] for c in insp.get_columns("cycles")}
        user_cols = {c["name"] for c in insp.get_columns("users")}
        with engine.begin() as conn:
            if "user_id" not in cycle_cols:
                conn.execute(text("ALTER TABLE cycles ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_cycles_user_id ON cycles(user_id)"))
                print("[migrate] added cycles.user_id FK -> users.id")
            if "token_version" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0"))
                print("[migrate] added users.token_version")
            visit_cols = {c["name"] for c in insp.get_columns("visits")}
            log_cols = {c["name"] for c in insp.get_columns("device_logs")}
            if "status" not in log_cols:
                conn.execute(text("ALTER TABLE device_logs ADD COLUMN status VARCHAR(16)"))
                print("[migrate] added device_logs.status")
            if "presence_s" not in visit_cols:
                conn.execute(text("ALTER TABLE visits ADD COLUMN presence_s FLOAT"))
                print("[migrate] added visits.presence_s")
            if "unit" not in visit_cols:
                conn.execute(text("ALTER TABLE visits ADD COLUMN unit INTEGER"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_visits_unit ON visits(unit)"))
                print("[migrate] added visits.unit")
                # backfill lanes from the opening log's external_id suffix
                try:
                    conn.execute(text(
                        "UPDATE visits SET unit = 1 WHERE unit IS NULL AND id IN "
                        "(SELECT visit_id FROM device_logs WHERE is_visit_start "
                        "AND (external_id LIKE '%:u1' OR external_id IS NULL))"))
                    conn.execute(text(
                        "UPDATE visits SET unit = 2 WHERE unit IS NULL AND id IN "
                        "(SELECT visit_id FROM device_logs WHERE is_visit_start "
                        "AND external_id LIKE '%:u2')"))
                    conn.execute(text(
                        "UPDATE visits SET unit = 1 WHERE unit IS NULL"))
                    print("[migrate] backfilled visits.unit lanes")
                except Exception as be:
                    print(f"[migrate] visits.unit backfill skipped: {be}")
            # scope cycle_code uniqueness per owner (drop legacy global index)
            idx_names = {i["name"] for i in insp.get_indexes("cycles")}
            try:
                idx_names |= {u["name"] for u in insp.get_unique_constraints("cycles") if u.get("name")}
            except Exception:
                pass
            if "ix_cycles_cycle_code" in idx_names:
                conn.execute(text("DROP INDEX IF EXISTS ix_cycles_cycle_code"))
                print("[migrate] dropped global ix_cycles_cycle_code")
            if "uq_cycle_user_code" not in idx_names:
                conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_cycle_user_code ON cycles(user_id, cycle_code)"))
                print("[migrate] added uq_cycle_user_code(user_id, cycle_code)")
    except Exception as e:
        print(f"[migrate] dev schema check failed: {e}")
    # --- uktech online-ingest columns (004_uktech_sync, alembic path on prod) ---
    # create_all above makes fresh tables, but long-lived dev DBs predate the
    # new columns: patch them idempotently on every boot (ALTER is safe to
    # re-check; guards make it a no-op when already applied).
    try:
        with engine.begin() as conn:
            names = inspect(conn).get_table_names()
            if "sync_state" not in names:
                SyncState.__table__.create(conn)
                print("[migrate] created sync_state")
            if "device_logs" in names:
                cols = [c["name"] for c in inspect(conn).get_columns("device_logs")]
                if "external_id" not in cols:
                    conn.execute(text("ALTER TABLE device_logs ADD COLUMN external_id VARCHAR(64)"))
                    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_log_cycle_external ON device_logs (cycle_id, external_id)"))
                    print("[migrate] added device_logs.external_id")
    except Exception as e:
        print(f"[migrate] uktech columns check failed: {e}")


def drop_all():
    Base.metadata.drop_all(engine)

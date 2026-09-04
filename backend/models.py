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
    ForeignKey, Index, text,
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
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    cycle_code = Column(String(32), unique=True, nullable=False, index=True)
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
    created_at = Column(DateTime(timezone=True), default=utcnow)
    cycle = relationship("Cycle", back_populates="logs")
    __table_args__ = (
        Index("ix_log_cycle_ts", "cycle_id", "timestamp"),
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
    # --- migration: add user_id to existing cycles table if missing ---
    # Works on PostgreSQL: check information_schema and ALTER if needed.
    try:
        with engine.begin() as conn:
            res = conn.execute(text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name='cycles' AND column_name='user_id'"
            )).fetchone()
            if res is None:
                conn.execute(text("ALTER TABLE cycles ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_cycles_user_id ON cycles(user_id)"))
                print("[migrate] added cycles.user_id FK -> users.id")
            # Ensure users table exists already via create_all; if old DB had no users, backfill a default admin
            # (admin creation is done lazily in auth module, not here)
    except Exception as e:
        print(f"[migrate] cycles.user_id check failed: {e}")


def drop_all():
    Base.metadata.drop_all(engine)

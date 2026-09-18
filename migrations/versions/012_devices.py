"""add devices table for direct ESP32 ingestion (per-device API keys)

Revision ID: 012_devices
Revises: 011_session_last_seen
Create Date: 2026-09-19

One row per physical device, bound to exactly one cycle: the server
resolves Device -> Cycle -> User, so firmware never selects a cycle.
Only the SHA256 of the API key is stored (raw key shown once at
creation/rotation). Deleting a cycle cascades to its devices, so no
orphaned active writer can survive its tenant.
"""
from alembic import op
import sqlalchemy as sa

revision = "012_devices"
down_revision = "011_session_last_seen"
branch_labels = None
depends_on = None


def _tables(conn):
    try:
        rows = conn.execute(sa.text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema='public'")).fetchall()
        return {r[0] for r in rows}
    except Exception:
        return set()


def upgrade() -> None:
    conn = op.get_bind()
    if "devices" in _tables(conn):
        return
    op.create_table(
        "devices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("device_id", sa.String(64), nullable=False),
        sa.Column("name", sa.String(120), nullable=True),
        sa.Column("key_prefix", sa.String(16), nullable=False),
        sa.Column("api_key_hash", sa.String(64), nullable=False),
        sa.Column("cycle_id", sa.Integer(),
                  sa.ForeignKey("cycles.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False,
                  server_default=sa.true()),
        sa.Column("firmware", sa.String(64), nullable=True),
        sa.Column("meta_json", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_ip", sa.String(64), nullable=True),
        sa.UniqueConstraint("device_id", name="uq_devices_device_id"),
        sa.UniqueConstraint("api_key_hash", name="uq_devices_key_hash"),
    )
    op.create_index("ix_devices_key_prefix", "devices", ["key_prefix"])
    op.create_index("ix_devices_cycle_id", "devices", ["cycle_id"])


def downgrade() -> None:
    try:
        op.drop_index("ix_devices_cycle_id", table_name="devices")
    except Exception:
        pass
    try:
        op.drop_index("ix_devices_key_prefix", table_name="devices")
    except Exception:
        pass
    try:
        op.drop_table("devices")
    except Exception:
        pass

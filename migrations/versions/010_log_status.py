"""add device_logs.status (raw upstream per-unit validation flag)

Revision ID: 010_log_status
Revises: 009_visit_unit
Create Date: 2026-09-18

Stores status1/status2 verbatim for debugging. The flag is flaky (identical
payloads arrive VALID and INVALID) and must never gate ingest decisions;
additive nullable column, no data loss.
"""
from alembic import op
import sqlalchemy as sa

revision = "010_log_status"
down_revision = "009_visit_unit"
branch_labels = None
depends_on = None


def _columns(conn, table):
    try:
        rows = conn.execute(sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema='public' AND table_name=:t"), {"t": table}).fetchall()
        return {r[0] for r in rows}
    except Exception:
        return set()


def upgrade() -> None:
    conn = op.get_bind()
    if "status" not in _columns(conn, "device_logs"):
        op.add_column("device_logs", sa.Column("status", sa.String(16),
                                               nullable=True))


def downgrade() -> None:
    try:
        op.drop_column("device_logs", "status")
    except Exception:
        pass

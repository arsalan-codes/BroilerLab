"""add visits.unit lane + backfill from log external_id suffix

Revision ID: 009_visit_unit
Revises: 008_visit_presence
Create Date: 2026-09-18

Visits gain a unit lane (1/2) so the dashboard renders one table per
weighing unit. Backfill: opening logs tagged "<serial>:<id>:u1" -> 1,
":u2" -> 2, everything else (HTTP ingest, legacy rows) -> 1.
Additive nullable column + data backfill: no data loss.
"""
from alembic import op
import sqlalchemy as sa

revision = "009_visit_unit"
down_revision = "008_visit_presence"
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
    if "unit" not in _columns(conn, "visits"):
        op.add_column("visits", sa.Column("unit", sa.Integer(), nullable=True))
        try:
            op.create_index("ix_visits_unit", "visits", ["unit"])
        except Exception:
            pass
    try:
        conn.execute(sa.text(
            "UPDATE visits SET unit = 1 WHERE unit IS NULL AND id IN "
            "(SELECT visit_id FROM device_logs WHERE is_visit_start "
            "AND (external_id LIKE '%:u1' OR external_id IS NULL))"))
        conn.execute(sa.text(
            "UPDATE visits SET unit = 2 WHERE unit IS NULL AND id IN "
            "(SELECT visit_id FROM device_logs WHERE is_visit_start "
            "AND external_id LIKE '%:u2')"))
        conn.execute(sa.text("UPDATE visits SET unit = 1 WHERE unit IS NULL"))
    except Exception:
        pass


def downgrade() -> None:
    try:
        op.drop_index("ix_visits_unit", table_name="visits")
    except Exception:
        pass
    try:
        op.drop_column("visits", "unit")
    except Exception:
        pass

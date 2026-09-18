"""add visits.presence_s (device-reported presence seconds)

Revision ID: 008_visit_presence
Revises: 007_weighing_sessions
Create Date: 2026-09-18

The uktech device accumulates total_seconds while a bird is inside until it
exits; the online ingest stores that authoritative value on visit close.
NULL while the visit is still open. Additive nullable column: no data loss.
"""
from alembic import op
import sqlalchemy as sa

revision = "008_visit_presence"
down_revision = "007_weighing_sessions"
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
    if "presence_s" not in _columns(conn, "visits"):
        op.add_column("visits", sa.Column("presence_s", sa.Float(),
                                          nullable=True))


def downgrade() -> None:
    try:
        op.drop_column("visits", "presence_s")
    except Exception:
        pass

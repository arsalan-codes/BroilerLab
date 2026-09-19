"""visit.invalid_since (INVALID ejection countdown state)

Revision ID: 014_invalid_since
Revises: 013_unit_live_core
Create Date: 2026-09-19

The motor ejects the bird ~30s after the status goes INVALID (owner rule).
invalid_since = the first INVALID record of the current consecutive
INVALID stretch, persisted on the visit row so the ejection fires exactly
across chunk boundaries and serverless restarts. Additive nullable column:
no data loss; NULL means VALID/empty or a legacy row.
"""
from alembic import op
import sqlalchemy as sa

revision = "014_invalid_since"
down_revision = "013_unit_live_core"
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
    if "invalid_since" not in _columns(conn, "visits"):
        op.add_column("visits", sa.Column("invalid_since",
                                          sa.DateTime(timezone=True),
                                          nullable=True))


def downgrade() -> None:
    try:
        op.drop_column("visits", "invalid_since")
    except Exception:
        pass

"""add weighing_sessions.last_seen_ts (exact presence accounting)

Revision ID: 011_session_last_seen
Revises: 010_log_status
Create Date: 2026-09-18

Tracks the last attributed row timestamp per session lane so presence-time
accumulation stays exact across chunk boundaries (no double count, no seam
loss). Additive nullable column: no data loss; NULL means "seed from the
next attributed row".
"""
from alembic import op
import sqlalchemy as sa

revision = "011_session_last_seen"
down_revision = "010_log_status"
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
    if "last_seen_ts" not in _columns(conn, "weighing_sessions"):
        op.add_column("weighing_sessions",
                      sa.Column("last_seen_ts", sa.DateTime(timezone=True),
                                nullable=True))


def downgrade() -> None:
    try:
        op.drop_column("weighing_sessions", "last_seen_ts")
    except Exception:
        pass

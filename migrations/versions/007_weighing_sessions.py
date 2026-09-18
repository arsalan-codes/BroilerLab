"""weighing-session state table (uktech session filter)

Revision ID: 007_weighing_sessions
Revises: 006_user_token_version
Create Date: 2026-09-18

WeighingSession persists the weighing.py state machine per
(serial, cycle, device, rfid) lane so sparse cloud polls share session
context across serverless invocations. See backend/weighing.py.

SQLite dev databases pick this up via Base.metadata.create_all; this
migration is the production (Neon/Postgres) path.
"""
from alembic import op
import sqlalchemy as sa

revision = "007_weighing_sessions"
down_revision = "006_user_token_version"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    try:
        tables = sa.inspect(conn).get_table_names()
    except Exception:
        tables = []
    if "weighing_sessions" in tables:
        return
    op.create_table(
        "weighing_sessions",
        sa.Column("key", sa.String(160), primary_key=True),
        sa.Column("serial", sa.String(32), nullable=False, index=True),
        sa.Column("cycle_id", sa.Integer(),
                  sa.ForeignKey("cycles.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("device_id", sa.String(32), nullable=True),
        sa.Column("rfid", sa.String(32), nullable=True),
        sa.Column("state", sa.String(20), nullable=False,
                  server_default="EMPTY"),
        sa.Column("candidate", sa.Float(), nullable=True),
        sa.Column("stable_count", sa.Integer(), nullable=False,
                  server_default="0"),
        sa.Column("zero_count", sa.Integer(), nullable=False,
                  server_default="0"),
        sa.Column("registered", sa.Float(), nullable=True),
        sa.Column("visit_id", sa.Integer(), nullable=True),
        sa.Column("first_ts", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )


def downgrade() -> None:
    try:
        op.drop_table("weighing_sessions")
    except Exception:
        pass

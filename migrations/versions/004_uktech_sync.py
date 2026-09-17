"""online device ingest cursors (uktech weight API)

Revision ID: 004_uktech_sync
Revises: 003_visit_reg_lookup
Create Date: 2026-09-17

  - device_logs.external_id ("<serial>:<remote id>", nullable) with a unique
    (cycle_id, external_id) index: re-syncs can never duplicate rows.
  - sync_state table: per-source incremental cursor (key "uktech:<serial>"
    -> highest ingested remote id + timestamp).

SQLite dev databases pick these up via Base.metadata.create_all; this
migration is the production (Neon/Postgres) path.
"""
from alembic import op
import sqlalchemy as sa

revision = "004_uktech_sync"
down_revision = "003_visit_reg_lookup"
branch_labels = None
depends_on = None

UQ = "uq_log_cycle_external"


def _has_column(conn, table: str, column: str) -> bool:
    try:
        cols = [c["name"] for c in sa.inspect(conn).get_columns(table)]
        return column in cols
    except Exception:
        return False


def _index_exists(conn, name: str) -> bool:
    try:
        row = conn.execute(sa.text(
            "SELECT 1 FROM pg_indexes WHERE indexname = :n"), {"n": name}).fetchone()
        return row is not None
    except Exception:
        return False  # non-Postgres (sqlite dev): create directly


def upgrade() -> None:
    conn = op.get_bind()
    if not _has_column(conn, "device_logs", "external_id"):
        op.add_column("device_logs", sa.Column("external_id", sa.String(64), nullable=True))
    if not _index_exists(conn, UQ):
        op.create_unique_constraint(UQ, "device_logs", ["cycle_id", "external_id"])
    try:
        tables = sa.inspect(conn).get_table_names()
    except Exception:
        tables = []
    if "sync_state" in tables:
        return
    op.create_table(
        "sync_state",
        sa.Column("key", sa.String(120), primary_key=True),
        sa.Column("last_id", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("note", sa.String(200), nullable=True),
    )


def downgrade() -> None:
    try:
        op.drop_table("sync_state")
    except Exception:
        pass
    try:
        op.drop_constraint(UQ, "device_logs", type_="unique")
    except Exception:
        pass
    try:
        op.drop_column("device_logs", "external_id")
    except Exception:
        pass

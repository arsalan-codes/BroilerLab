"""speed up the realtime registration lookup (device table)

Revision ID: 003_visit_reg_lookup
Revises: 002_organization
Create Date: 2026-09-03

The device realtime table reads
  SELECT ... FROM visits
  WHERE cycle_id = :cid AND bird_id IS NOT NULL
  ORDER BY visit_start DESC LIMIT :n
after every cycle selection. The existing indexes cover (cycle_id, bird_id)
and (cycle_id, visit_start) separately; one composite index serves the exact
filter + order of this query.

No column changes: all six device-table parameters (feed consumed,
bird weight, elapsed, datetime, bird id, device id) already have columns
(feed_intake_g, initial/final_weight_g, visit_start/visit_end, bird_id,
sensor_id) — elapsed is derived, never stored.
"""
from alembic import op
import sqlalchemy as sa

revision = "003_visit_reg_lookup"
down_revision = "002_organization"
branch_labels = None
depends_on = None

INDEX = "ix_visit_cycle_bird_start"


def _index_exists(conn, name: str) -> bool:
    row = conn.execute(sa.text(
        "SELECT 1 FROM pg_indexes WHERE indexname = :n"), {"n": name}).fetchone()
    return row is not None


def upgrade() -> None:
    conn = op.get_bind()
    try:
        exists = _index_exists(conn, INDEX)
    except Exception:
        exists = False  # non-Postgres (sqlite dev): just create it
    if not exists:
        op.create_index(INDEX, "visits", ["cycle_id", "bird_id", "visit_start"])


def downgrade() -> None:
    try:
        op.drop_index(INDEX, table_name="visits")
    except Exception:
        pass

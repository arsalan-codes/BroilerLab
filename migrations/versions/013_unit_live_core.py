"""per-unit live core state (process_unit_sample): visit live columns,
cycle ingest source, unit_states pair clock

Revision ID: 013_unit_live_core
Revises: 012_devices
Create Date: 2026-09-19

The report no longer gates on the weighing-session filter: ONE open visit
row per (device, unit) is updated in place on every record. Its live
state (position, elapsed, feed baseline, empty streak, counter) lives on
the visit row; the consecutive-pair clock lives in unit_states per
(cycle, device, unit). Cycles gain ingest_source ("api"/"direct", exactly
one enforced). All additive, no data loss, restart-safe.
"""
from alembic import op
import sqlalchemy as sa

revision = "013_unit_live_core"
down_revision = "012_devices"
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


def _tables(conn):
    try:
        rows = conn.execute(sa.text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema='public'")).fetchall()
        return {r[0] for r in rows}
    except Exception:
        return set()


_VISIT_COLS = [
    ("bird_position", sa.String(8), {"server_default": "inside"}),
    ("last_tag", sa.String(32), {}),
    ("elapsed_s", sa.Float(), {}),
    ("presence_acc", sa.Float(), {}),
    ("counter_last", sa.Float(), {}),
    ("counter_live", sa.Boolean(), {"server_default": sa.false()}),
    ("bin_baseline", sa.Float(), {}),
    ("bin_calib", sa.Float(), {}),
    ("empty_streak", sa.Integer(), {"server_default": "0"}),
    ("empty_since", sa.DateTime(timezone=True), {}),
    ("initial_confirmed_g", sa.Float(), {}),
    ("close_reason", sa.String(16), {}),
    ("stale", sa.Boolean(), {"server_default": sa.false()}),
]


def upgrade() -> None:
    conn = op.get_bind()
    have = _columns(conn, "visits")
    for name, typ, kw in _VISIT_COLS:
        if name not in have:
            op.add_column("visits", sa.Column(name, typ, nullable=True, **kw))
    if "unit_states" not in _tables(conn):
        op.create_table(
            "unit_states",
            sa.Column("cycle_id", sa.Integer(),
                      sa.ForeignKey("cycles.id", ondelete="CASCADE"),
                      primary_key=True),
            sa.Column("device_id", sa.String(32), primary_key=True),
            sa.Column("unit", sa.Integer(), primary_key=True),
            sa.Column("prev_ts", sa.DateTime(timezone=True), nullable=True),
            sa.Column("prev_valid", sa.Boolean(), nullable=True),
            sa.Column("prev_bird", sa.Boolean(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True),
                      nullable=False, server_default=sa.func.now()),
        )
    if "ingest_source" not in _columns(conn, "cycles"):
        op.add_column("cycles", sa.Column(
            "ingest_source", sa.String(8), nullable=True,
            server_default="api"))


def downgrade() -> None:
    try:
        op.drop_column("cycles", "ingest_source")
    except Exception:
        pass
    try:
        op.drop_table("unit_states")
    except Exception:
        pass
    try:
        conn = op.get_bind()
        have = _columns(conn, "visits")
        for name, _typ, _kw in _VISIT_COLS:
            if name in have:
                op.drop_column("visits", name)
    except Exception:
        pass

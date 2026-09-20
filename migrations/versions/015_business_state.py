"""business state machine + persisted ejection deadline + separated
measurement fields + open-lane unique index

Revision ID: 015_business_state
Revises: 014_invalid_since
Create Date: 2026-09-20

Explicit business states (EMPTY/FEEDING/EJECTING/EXITED/UNIDENTIFIED/
STALE) distinct from the raw device VALID/INVALID flag. invalid_deadline
(invalid_since + EJECTION_TIMEOUT_S) is persisted so a restart never
resets the ejection countdown and the lazy sweep finalizes an overdue
visit without waiting for a new record. Measurement fields are separated
(live / last_valid / initial_bin / final_bin / weight_gain) so no column
carries two meanings. uq_visit_open_lane (partial unique index) makes
duplicate open visits per (cycle, device, unit) impossible at the DB
level; legacy duplicate open rows are closed as 'superseded' (newest per
lane kept) before the index is created. All additive, no data loss.
"""
from alembic import op
import sqlalchemy as sa

revision = "015_business_state"
down_revision = "014_invalid_since"
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


_VISIT_COLS = [
    ("invalid_deadline", sa.DateTime(timezone=True), {}),
    ("business_state", sa.String(16), {"server_default": "EMPTY"}),
    ("live_weight_g", sa.Float(), {}),
    ("last_valid_weight_g", sa.Float(), {}),
    ("initial_bin_weight_g", sa.Float(), {}),
    ("last_valid_bin_weight_g", sa.Float(), {}),
    ("final_bin_weight_g", sa.Float(), {}),
    ("weight_gain_g", sa.Float(), {}),
    ("last_source_id", sa.String(64), {}),
    ("last_source_timestamp", sa.DateTime(timezone=True), {}),
]


_UNIT_COLS = [
    ("business_state", sa.String(16), {"server_default": "EMPTY"}),
    ("active_visit_id", sa.Integer(), {}),
    ("invalid_since", sa.DateTime(timezone=True), {}),
    ("invalid_deadline", sa.DateTime(timezone=True), {}),
    ("last_source_id", sa.String(64), {}),
]


def upgrade() -> None:
    conn = op.get_bind()
    have = _columns(conn, "visits")
    for name, typ, kw in _VISIT_COLS:
        if name not in have:
            op.add_column("visits", sa.Column(name, typ, nullable=True, **kw))
    uhave = _columns(conn, "unit_states")
    for name, typ, kw in _UNIT_COLS:
        if name not in uhave:
            op.add_column("unit_states", sa.Column(name, typ, nullable=True, **kw))
    # backfill the explicit business state on rows predating it
    conn.execute(sa.text(
        "UPDATE visits SET business_state = CASE "
        "WHEN visit_end IS NULL THEN 'FEEDING' ELSE 'EXITED' END "
        "WHERE business_state = 'EMPTY' OR business_state IS NULL"))
    # dedupe open lanes (keep the NEWEST open visit per lane; older ones
    # only aggregated contradictory state) so the unique index is safe
    conn.execute(sa.text(
        "UPDATE visits SET visit_end = CURRENT_TIMESTAMP, "
        "close_reason = 'superseded', business_state = 'EXITED' "
        "WHERE visit_end IS NULL AND id IN ("
        "SELECT v.id FROM visits v WHERE v.visit_end IS NULL AND EXISTS ("
        "SELECT 1 FROM visits v2 WHERE v2.visit_end IS NULL "
        "AND v2.cycle_id = v.cycle_id "
        "AND COALESCE(v2.device_id,'-') = COALESCE(v.device_id,'-') "
        "AND COALESCE(v2.unit,1) = COALESCE(v.unit,1) "
        "AND v2.id > v.id))"))
    # concurrency: two workers can never both hold an open visit per lane
    conn.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_visit_open_lane "
        "ON visits(cycle_id, COALESCE(device_id,'-'), COALESCE(unit,1)) "
        "WHERE visit_end IS NULL"))


def downgrade() -> None:
    try:
        op.drop_index("uq_visit_open_lane", table_name="visits")
    except Exception:
        pass
    try:
        conn = op.get_bind()
        have = _columns(conn, "visits")
        for name, _typ, _kw in _VISIT_COLS:
            if name in have:
                op.drop_column("visits", name)
        uhave = _columns(conn, "unit_states")
        for name, _typ, _kw in _UNIT_COLS:
            if name in uhave:
                op.drop_column("unit_states", name)
    except Exception:
        pass

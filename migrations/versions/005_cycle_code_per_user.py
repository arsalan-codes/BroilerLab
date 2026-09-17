"""scope cycle_code uniqueness per owner instead of globally

Revision ID: 005_cycle_code_per_user
Revises: 004_uktech_sync
Create Date: 2026-09-18

A globally unique cycle_code let any tenant probe (409) or squat another
tenant's codes. Cycles are now unique per (user_id, cycle_code).

Safe to apply: the old global index guaranteed no duplicate codes at all,
so the composite constraint cannot conflict with existing rows. Legacy
user_id NULL rows stay mutually distinct under Postgres NULL semantics.
"""
from alembic import op
import sqlalchemy as sa

revision = "005_cycle_code_per_user"
down_revision = "004_uktech_sync"
branch_labels = None
depends_on = None

GLOBAL_IX = "ix_cycles_cycle_code"
UQ = "uq_cycle_user_code"


def _names(conn, kind):
    try:
        rows = conn.execute(sa.text(
            "SELECT indexname FROM pg_indexes "
            "WHERE schemaname='public' AND tablename='cycles'")).fetchall()
        return {r[0] for r in rows}
    except Exception:
        return set()  # non-Postgres (sqlite dev): handled by IF EXISTS below


def upgrade() -> None:
    conn = op.get_bind()
    names = _names(conn, "cycles")
    if GLOBAL_IX in names:
        op.drop_index(GLOBAL_IX, table_name="cycles")
    else:
        # sqlite / unknown: best-effort, ignore when absent
        try:
            conn.execute(sa.text(f"DROP INDEX IF EXISTS {GLOBAL_IX}"))
        except Exception:
            pass
    if UQ not in names:
        try:
            op.create_unique_constraint(UQ, "cycles", ["user_id", "cycle_code"])
        except Exception:
            # sqlite table-constraint equivalent already exists via create_all
            conn.execute(sa.text(
                f"CREATE UNIQUE INDEX IF NOT EXISTS {UQ} "
                "ON cycles(user_id, cycle_code)"))


def downgrade() -> None:
    conn = op.get_bind()
    try:
        op.drop_constraint(UQ, "cycles", type_="unique")
    except Exception:
        try:
            conn.execute(sa.text(f"DROP INDEX IF EXISTS {UQ}"))
        except Exception:
            pass
    try:
        op.create_index(GLOBAL_IX, "cycles", ["cycle_code"], unique=True)
    except Exception:
        pass

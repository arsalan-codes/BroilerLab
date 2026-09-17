"""add users.token_version so password changes kill old JWTs

Revision ID: 006_user_token_version
Revises: 005_cycle_code_per_user
Create Date: 2026-09-18

JWTs carry tv=user.token_version at issue time; change-password bumps the
column, so outstanding tokens fail the version check. Default 0 keeps every
existing session valid through the upgrade.
"""
from alembic import op
import sqlalchemy as sa

revision = "006_user_token_version"
down_revision = "005_cycle_code_per_user"
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
    if "token_version" not in _columns(conn, "users"):
        op.add_column("users", sa.Column("token_version", sa.Integer(),
                                         nullable=False, server_default="0"))
    else:
        try:
            conn.execute(sa.text(
                "UPDATE users SET token_version=0 WHERE token_version IS NULL"))
        except Exception:
            pass


def downgrade() -> None:
    try:
        op.drop_column("users", "token_version")
    except Exception:
        pass

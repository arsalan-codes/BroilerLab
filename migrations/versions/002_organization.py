"""add organizations table + users.organization_id (nullable FK)

Revision ID: 002_organization
Revises: 001_baseline
Create Date: 2026-08-31
"""
from alembic import op
import sqlalchemy as sa

revision = "002_organization"
down_revision = "001_baseline"
branch_labels = None
depends_on = None


def _table_exists(conn, name: str) -> bool:
    row = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables "
        "WHERE table_schema='public' AND table_name=:n"), {"n": name}).fetchone()
    return row is not None


def _column_exists(conn, table: str, column: str) -> bool:
    row = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_schema='public' AND table_name=:t AND column_name=:c"),
        {"t": table, "c": column}).fetchone()
    return row is not None


def upgrade() -> None:
    # Resilient re-run: databases provisioned by an older init_db may already
    # carry the organizations table while alembic_version lagged behind.
    conn = op.get_bind()
    if not _table_exists(conn, "organizations"):
        op.create_table(
            "organizations",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
            sa.PrimaryKeyConstraint("id"),
        )
    if not _column_exists(conn, "users", "organization_id"):
        op.add_column("users", sa.Column("organization_id", sa.Integer(), nullable=True))
        op.create_foreign_key(None, "users", "organizations", ["organization_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint("fk_users_organization_id", "users", type_="foreignkey")
    op.drop_column("users", "organization_id")
    op.drop_table("organizations")

"""baseline: create users, cycles, visits, device_logs

Revision ID: 001_baseline
Revises:
Create Date: 2026-08-31
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(160), nullable=False),
        sa.Column("username", sa.String(60), nullable=True),
        sa.Column("full_name", sa.String(120), nullable=True),
        sa.Column("hashed_password", sa.String(200), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("last_login", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    op.create_table(
        "cycles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("cycle_code", sa.String(32), nullable=False),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("strain", sa.String(40), nullable=False, server_default="ross308"),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("end_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("bird_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("pen_id", sa.String(32), nullable=True),
        sa.Column("notes", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_cycles_cycle_code", "cycles", ["cycle_code"], unique=True)
    op.create_index("ix_cycles_user_id", "cycles", ["user_id"])

    op.create_table(
        "visits",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("cycle_id", sa.Integer(), nullable=False),
        sa.Column("bird_id", sa.String(32), nullable=False),
        sa.Column("visit_start", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("visit_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("age_day", sa.Integer(), nullable=True),
        sa.Column("initial_weight_g", sa.Float(), nullable=True),
        sa.Column("final_weight_g", sa.Float(), nullable=True),
        sa.Column("feed_intake_g", sa.Float(), nullable=True),
        sa.Column("sensor_id", sa.String(32), nullable=True),
        sa.Column("rssi", sa.Float(), nullable=True),
        sa.Column("read_ok", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("co_feed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("temp_c", sa.Float(), nullable=True),
        sa.Column("humidity", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["cycle_id"], ["cycles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_visit_cycle_bird", "visits", ["cycle_id", "bird_id"])
    op.create_index("ix_visit_start", "visits", ["cycle_id", "visit_start"])

    op.create_table(
        "device_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("cycle_id", sa.Integer(), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("flock_id", sa.String(32), nullable=True),
        sa.Column("bird_id", sa.String(32), nullable=True),
        sa.Column("sensor_id", sa.String(32), nullable=True),
        sa.Column("age_day", sa.Integer(), nullable=True),
        sa.Column("raw_weight_g", sa.Float(), nullable=True),
        sa.Column("weight_g", sa.Float(), nullable=True),
        sa.Column("feed_bin_kg", sa.Float(), nullable=True),
        sa.Column("feed_delta_g", sa.Float(), nullable=True),
        sa.Column("temp_c", sa.Float(), nullable=True),
        sa.Column("humidity", sa.Float(), nullable=True),
        sa.Column("rssi", sa.Float(), nullable=True),
        sa.Column("visit_id", sa.Integer(), nullable=True),
        sa.Column("is_visit_start", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_visit_end", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["cycle_id"], ["cycles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["visit_id"], ["visits.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_log_cycle_ts", "device_logs", ["cycle_id", sa.text("timestamp DESC")])


def downgrade() -> None:
    op.drop_table("device_logs")
    op.drop_table("visits")
    op.drop_table("cycles")
    op.drop_table("users")
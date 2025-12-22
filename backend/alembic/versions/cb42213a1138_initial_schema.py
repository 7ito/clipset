"""Initial schema

Revision ID: cb42213a1138
Revises:
Create Date: 2025-12-17 17:28:04.265622

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "cb42213a1138"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users table
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.Enum("user", "admin", name="userrole"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("weekly_upload_bytes", sa.BigInteger(), nullable=False),
        sa.Column("last_upload_reset", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=True)

    # Categories table
    op.create_table(
        "categories",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("created_by", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_categories_name"), "categories", ["name"], unique=True)
    op.create_index(op.f("ix_categories_slug"), "categories", ["slug"], unique=True)

    # Videos table
    op.create_table(
        "videos",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("thumbnail_filename", sa.String(length=255), nullable=True),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("uploaded_by", sa.String(length=36), nullable=False),
        sa.Column("category_id", sa.String(length=36), nullable=True),
        sa.Column("view_count", sa.Integer(), nullable=False),
        sa.Column(
            "processing_status",
            sa.Enum(
                "pending", "processing", "completed", "failed", name="processingstatus"
            ),
            nullable=False,
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["category_id"], ["categories.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("filename"),
    )
    op.create_index(
        op.f("ix_videos_category_id"), "videos", ["category_id"], unique=False
    )
    op.create_index(
        op.f("ix_videos_created_at"), "videos", ["created_at"], unique=False
    )
    op.create_index(
        op.f("ix_videos_processing_status"),
        "videos",
        ["processing_status"],
        unique=False,
    )
    op.create_index(op.f("ix_videos_title"), "videos", ["title"], unique=False)
    op.create_index(
        op.f("ix_videos_uploaded_by"), "videos", ["uploaded_by"], unique=False
    )

    # Invitations table
    op.create_table(
        "invitations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("created_by", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_invitations_email"), "invitations", ["email"], unique=False
    )
    op.create_index(op.f("ix_invitations_token"), "invitations", ["token"], unique=True)

    # Config table
    op.create_table(
        "config",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("max_file_size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("weekly_upload_limit_bytes", sa.BigInteger(), nullable=False),
        sa.Column("video_storage_path", sa.String(length=500), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("updated_by", sa.String(length=36), nullable=True),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("config")
    op.drop_index(op.f("ix_invitations_token"), table_name="invitations")
    op.drop_index(op.f("ix_invitations_email"), table_name="invitations")
    op.drop_table("invitations")
    op.drop_index(op.f("ix_videos_uploaded_by"), table_name="videos")
    op.drop_index(op.f("ix_videos_title"), table_name="videos")
    op.drop_index(op.f("ix_videos_processing_status"), table_name="videos")
    op.drop_index(op.f("ix_videos_created_at"), table_name="videos")
    op.drop_index(op.f("ix_videos_category_id"), table_name="videos")
    op.drop_table("videos")
    op.drop_index(op.f("ix_categories_slug"), table_name="categories")
    op.drop_index(op.f("ix_categories_name"), table_name="categories")
    op.drop_table("categories")
    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")

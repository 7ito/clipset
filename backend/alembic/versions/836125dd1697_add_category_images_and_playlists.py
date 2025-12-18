"""add_category_images_and_playlists

Revision ID: 836125dd1697
Revises: cb42213a1138
Create Date: 2025-12-18 14:21:55.382662

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "836125dd1697"
down_revision: Union[str, None] = "cb42213a1138"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new fields to categories table
    op.add_column("categories", sa.Column("description", sa.Text(), nullable=True))
    op.add_column(
        "categories", sa.Column("image_filename", sa.String(length=255), nullable=True)
    )
    op.add_column("categories", sa.Column("updated_at", sa.DateTime(), nullable=True))

    # Create playlists table
    op.create_table(
        "playlists",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=36), nullable=False),
        sa.Column("is_public", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_playlists_created_by"), "playlists", ["created_by"], unique=False
    )
    op.create_index(
        op.f("ix_playlists_is_public"), "playlists", ["is_public"], unique=False
    )

    # Create playlist_videos junction table
    op.create_table(
        "playlist_videos",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("playlist_id", sa.String(length=36), nullable=False),
        sa.Column("video_id", sa.String(length=36), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("added_at", sa.DateTime(), nullable=False),
        sa.Column("added_by", sa.String(length=36), nullable=True),
        sa.ForeignKeyConstraint(["added_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["playlist_id"], ["playlists.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["video_id"], ["videos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("playlist_id", "video_id", name="uix_playlist_video"),
    )
    op.create_index(
        "idx_playlist_position",
        "playlist_videos",
        ["playlist_id", "position"],
        unique=False,
    )
    op.create_index(
        op.f("ix_playlist_videos_playlist_id"),
        "playlist_videos",
        ["playlist_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_playlist_videos_video_id"),
        "playlist_videos",
        ["video_id"],
        unique=False,
    )


def downgrade() -> None:
    # Drop playlist_videos table
    op.drop_index(op.f("ix_playlist_videos_video_id"), table_name="playlist_videos")
    op.drop_index(op.f("ix_playlist_videos_playlist_id"), table_name="playlist_videos")
    op.drop_index("idx_playlist_position", table_name="playlist_videos")
    op.drop_table("playlist_videos")

    # Drop playlists table
    op.drop_index(op.f("ix_playlists_is_public"), table_name="playlists")
    op.drop_index(op.f("ix_playlists_created_by"), table_name="playlists")
    op.drop_table("playlists")

    # Remove new columns from categories
    op.drop_column("categories", "updated_at")
    op.drop_column("categories", "image_filename")
    op.drop_column("categories", "description")

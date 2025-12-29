"""add_short_id_to_videos

Revision ID: 75963bacc739
Revises: c44bfe33a08a
Create Date: 2025-12-29 15:14:36.180151

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from nanoid import generate


# revision identifiers, used by Alembic.
revision: str = "75963bacc739"
down_revision: Union[str, None] = "c44bfe33a08a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def generate_short_id() -> str:
    """Generate 10-char alphanumeric short ID for URLs."""
    return generate(
        alphabet="0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
        size=10,
    )


def upgrade() -> None:
    # 1. Add column as nullable initially
    op.add_column("videos", sa.Column("short_id", sa.String(length=10), nullable=True))

    # 2. Backfill existing videos
    connection = op.get_bind()
    videos = connection.execute(sa.text("SELECT id FROM videos")).fetchall()

    for video in videos:
        new_short_id = generate_short_id()
        connection.execute(
            sa.text("UPDATE videos SET short_id = :short_id WHERE id = :id"),
            {"short_id": new_short_id, "id": video[0]},
        )

    # 3. Make non-nullable and add constraints
    with op.batch_alter_table("videos", schema=None) as batch_op:
        batch_op.alter_column("short_id", nullable=False)
        batch_op.create_index(
            batch_op.f("ix_videos_short_id"), ["short_id"], unique=True
        )


def downgrade() -> None:
    with op.batch_alter_table("videos", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_videos_short_id"))
        batch_op.drop_column("short_id")

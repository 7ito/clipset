"""add_short_id_to_playlists

Revision ID: 8bfb4401e6ef
Revises: 75963bacc739
Create Date: 2025-12-31 14:02:06.437263

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from nanoid import generate


# revision identifiers, used by Alembic.
revision: str = "8bfb4401e6ef"
down_revision: Union[str, None] = "75963bacc739"
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
    op.add_column(
        "playlists", sa.Column("short_id", sa.String(length=10), nullable=True)
    )

    # 2. Backfill existing playlists
    connection = op.get_bind()
    playlists = connection.execute(sa.text("SELECT id FROM playlists")).fetchall()

    for playlist in playlists:
        new_short_id = generate_short_id()
        connection.execute(
            sa.text("UPDATE playlists SET short_id = :short_id WHERE id = :id"),
            {"short_id": new_short_id, "id": playlist[0]},
        )

    # 3. Make non-nullable and add constraints
    with op.batch_alter_table("playlists", schema=None) as batch_op:
        batch_op.alter_column("short_id", nullable=False)
        batch_op.create_index(
            batch_op.f("ix_playlists_short_id"), ["short_id"], unique=True
        )


def downgrade() -> None:
    with op.batch_alter_table("playlists", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_playlists_short_id"))
        batch_op.drop_column("short_id")

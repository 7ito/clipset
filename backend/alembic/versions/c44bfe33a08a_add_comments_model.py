"""add_comments_model

Revision ID: c44bfe33a08a
Revises: 24738048b25a
Create Date: 2025-12-29 11:13:51.152914

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c44bfe33a08a"
down_revision: Union[str, None] = "24738048b25a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "comments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("video_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("timestamp_seconds", sa.Integer(), nullable=True),
        sa.Column("parent_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["parent_id"], ["comments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["video_id"], ["videos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_comments_parent_id"), "comments", ["parent_id"], unique=False
    )
    op.create_index(op.f("ix_comments_user_id"), "comments", ["user_id"], unique=False)
    op.create_index(
        op.f("ix_comments_video_id"), "comments", ["video_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_comments_video_id"), table_name="comments")
    op.drop_index(op.f("ix_comments_user_id"), table_name="comments")
    op.drop_index(op.f("ix_comments_parent_id"), table_name="comments")
    op.drop_table("comments")

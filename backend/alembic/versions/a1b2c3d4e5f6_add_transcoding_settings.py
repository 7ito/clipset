"""add_transcoding_settings

Revision ID: a1b2c3d4e5f6
Revises: 8bfb4401e6ef
Create Date: 2026-01-01 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "8bfb4401e6ef"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # GPU Settings
    op.add_column(
        "config",
        sa.Column(
            "use_gpu_transcoding", sa.Boolean(), nullable=False, server_default="0"
        ),
    )
    op.add_column(
        "config",
        sa.Column("gpu_device_id", sa.Integer(), nullable=False, server_default="0"),
    )

    # NVENC Settings
    op.add_column(
        "config",
        sa.Column(
            "nvenc_preset", sa.String(length=10), nullable=False, server_default="p4"
        ),
    )
    op.add_column(
        "config",
        sa.Column("nvenc_cq", sa.Integer(), nullable=False, server_default="18"),
    )
    op.add_column(
        "config",
        sa.Column(
            "nvenc_rate_control",
            sa.String(length=20),
            nullable=False,
            server_default="vbr",
        ),
    )
    op.add_column(
        "config",
        sa.Column(
            "nvenc_max_bitrate",
            sa.String(length=20),
            nullable=False,
            server_default="8M",
        ),
    )
    op.add_column(
        "config",
        sa.Column(
            "nvenc_buffer_size",
            sa.String(length=20),
            nullable=False,
            server_default="16M",
        ),
    )

    # CPU Fallback Settings
    op.add_column(
        "config",
        sa.Column(
            "cpu_preset", sa.String(length=20), nullable=False, server_default="medium"
        ),
    )
    op.add_column(
        "config",
        sa.Column("cpu_crf", sa.Integer(), nullable=False, server_default="18"),
    )

    # Output Settings
    op.add_column(
        "config",
        sa.Column(
            "max_resolution",
            sa.String(length=10),
            nullable=False,
            server_default="1080p",
        ),
    )
    op.add_column(
        "config",
        sa.Column(
            "audio_bitrate", sa.String(length=20), nullable=False, server_default="192k"
        ),
    )

    # Preset Mode
    op.add_column(
        "config",
        sa.Column(
            "transcode_preset_mode",
            sa.String(length=20),
            nullable=False,
            server_default="balanced",
        ),
    )


def downgrade() -> None:
    op.drop_column("config", "transcode_preset_mode")
    op.drop_column("config", "audio_bitrate")
    op.drop_column("config", "max_resolution")
    op.drop_column("config", "cpu_crf")
    op.drop_column("config", "cpu_preset")
    op.drop_column("config", "nvenc_buffer_size")
    op.drop_column("config", "nvenc_max_bitrate")
    op.drop_column("config", "nvenc_rate_control")
    op.drop_column("config", "nvenc_cq")
    op.drop_column("config", "nvenc_preset")
    op.drop_column("config", "gpu_device_id")
    op.drop_column("config", "use_gpu_transcoding")

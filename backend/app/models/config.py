from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    String,
    DateTime,
    ForeignKey,
    Boolean,
)
from datetime import datetime, timezone
from app.database import Base


class Config(Base):
    """
    Application configuration stored in database.
    This is a single-row table (id=1) for storing runtime configuration.
    """

    __tablename__ = "config"

    id = Column(Integer, primary_key=True, default=1)  # Always 1 (singleton)

    # Upload limits
    max_file_size_bytes = Column(
        BigInteger, default=2_147_483_648, nullable=False
    )  # 2GB
    weekly_upload_limit_bytes = Column(
        BigInteger, default=4_294_967_296, nullable=False
    )  # 4GB

    # Storage configuration
    video_storage_path = Column(
        String(500), default="./data/uploads/videos", nullable=False
    )

    # GPU Settings
    use_gpu_transcoding = Column(Boolean, default=False, nullable=False)
    gpu_device_id = Column(Integer, default=0, nullable=False)

    # NVENC Settings
    nvenc_preset = Column(String(10), default="p4", nullable=False)
    nvenc_cq = Column(Integer, default=18, nullable=False)
    nvenc_rate_control = Column(String(20), default="vbr", nullable=False)
    nvenc_max_bitrate = Column(String(20), default="8M", nullable=False)
    nvenc_buffer_size = Column(String(20), default="16M", nullable=False)

    # CPU Fallback Settings
    cpu_preset = Column(String(20), default="medium", nullable=False)
    cpu_crf = Column(Integer, default=18, nullable=False)

    # Output Settings
    max_resolution = Column(String(10), default="1080p", nullable=False)
    audio_bitrate = Column(String(20), default="192k", nullable=False)

    # Preset Mode (quality, balanced, performance, custom)
    transcode_preset_mode = Column(String(20), default="balanced", nullable=False)

    # Metadata
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        onupdate=lambda: datetime.now(timezone.utc),
    )
    updated_by = Column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    def __repr__(self):
        return f"<Config(max_file_size={self.max_file_size_bytes}, gpu={self.use_gpu_transcoding}, preset={self.transcode_preset_mode})>"

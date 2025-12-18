from sqlalchemy import Column, Integer, BigInteger, String, DateTime, ForeignKey
from datetime import datetime
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

    # Metadata
    updated_at = Column(
        DateTime, default=datetime.utcnow, nullable=False, onupdate=datetime.utcnow
    )
    updated_by = Column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    def __repr__(self):
        return f"<Config(max_file_size={self.max_file_size_bytes}, weekly_limit={self.weekly_upload_limit_bytes})>"

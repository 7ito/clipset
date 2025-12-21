from sqlalchemy import (
    Column,
    String,
    Text,
    BigInteger,
    Integer,
    DateTime,
    ForeignKey,
    Enum,
)
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid
import enum
from app.database import Base


class ProcessingStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class Video(Base):
    __tablename__ = "videos"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # Basic info
    title = Column(String(200), nullable=False, index=True)
    description = Column(Text, nullable=True)

    # File info
    filename = Column(
        String(255), nullable=False, unique=True
    )  # Processed video filename
    thumbnail_filename = Column(String(255), nullable=True)  # Generated thumbnail
    original_filename = Column(String(255), nullable=False)  # Original upload filename
    storage_path = Column(String(500), nullable=True)  # Base path where video is stored

    # Metadata
    file_size_bytes = Column(BigInteger, nullable=False)
    duration_seconds = Column(Integer, nullable=True)  # Extracted after processing

    # Ownership and categorization
    uploaded_by = Column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category_id = Column(
        String(36),
        ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Engagement
    view_count = Column(Integer, default=0, nullable=False)

    # Processing status
    processing_status = Column(
        Enum(ProcessingStatus),
        default=ProcessingStatus.PENDING,
        nullable=False,
        index=True,
    )
    error_message = Column(Text, nullable=True)  # Set if processing_status = FAILED

    # Timestamps
    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True
    )

    # Relationships
    uploader = relationship("User", back_populates="videos")
    category = relationship("Category", back_populates="videos")

    def __repr__(self):
        return f"<Video(id={self.id}, title={self.title}, status={self.processing_status})>"

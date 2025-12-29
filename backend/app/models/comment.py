from sqlalchemy import Column, String, Text, Integer, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid
from app.database import Base


class Comment(Base):
    """
    Comment model for videos.

    Users can comment on any video and reply to other comments (single-level).
    Comments can optionally reference a specific timestamp in the video.
    """

    __tablename__ = "comments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    video_id = Column(
        String(36),
        ForeignKey("videos.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    content = Column(Text, nullable=False)
    timestamp_seconds = Column(
        Integer, nullable=True
    )  # Optional video timestamp reference

    # Parent ID for single-level replies
    parent_id = Column(
        String(36),
        ForeignKey("comments.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Timestamps
    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    video = relationship("Video", back_populates="comments")
    author = relationship("User", back_populates="comments")

    # Self-referential relationship for replies
    parent = relationship("Comment", remote_side=[id], back_populates="replies")
    replies = relationship(
        "Comment",
        back_populates="parent",
        cascade="all, delete-orphan",
        order_by="Comment.created_at.asc()",
    )

    def __repr__(self):
        return (
            f"<Comment(id={self.id}, user_id={self.user_id}, video_id={self.video_id})>"
        )

"""
Playlist models for organizing videos into collections.

Users can create playlists and add any video (not just their own) to playlists.
"""

from sqlalchemy import (
    Column,
    String,
    Text,
    Integer,
    Boolean,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid
from nanoid import generate
from app.database import Base


def generate_short_id() -> str:
    """Generate 10-char alphanumeric short ID for URLs."""
    return generate(
        alphabet="0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
        size=10,
    )


class Playlist(Base):
    """
    Playlist model for video collections.

    A playlist is a curated collection of videos created by a user.
    Playlists can be public (visible to all) or private (visible only to creator).
    """

    __tablename__ = "playlists"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    short_id = Column(
        String(10), unique=True, index=True, default=generate_short_id, nullable=False
    )
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)

    # Ownership
    created_by = Column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Visibility
    is_public = Column(Boolean, default=True, nullable=False, index=True)

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
    creator = relationship("User", back_populates="playlists")
    playlist_videos = relationship(
        "PlaylistVideo",
        back_populates="playlist",
        cascade="all, delete-orphan",
        order_by="PlaylistVideo.position",
    )

    def __repr__(self):
        return (
            f"<Playlist(id={self.id}, name={self.name}, created_by={self.created_by})>"
        )


class PlaylistVideo(Base):
    """
    Junction table for playlist-video many-to-many relationship.

    Tracks which videos are in which playlists, their order, and who added them.
    """

    __tablename__ = "playlist_videos"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # Foreign keys
    playlist_id = Column(
        String(36),
        ForeignKey("playlists.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    video_id = Column(
        String(36),
        ForeignKey("videos.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Metadata
    position = Column(Integer, nullable=False)  # 0-indexed position in playlist
    added_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    added_by = Column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    playlist = relationship("Playlist", back_populates="playlist_videos")
    video = relationship("Video")
    adder = relationship("User", foreign_keys=[added_by])

    # Constraints and Indexes
    __table_args__ = (
        UniqueConstraint("playlist_id", "video_id", name="uix_playlist_video"),
        Index("idx_playlist_position", "playlist_id", "position"),
    )

    def __repr__(self):
        return f"<PlaylistVideo(playlist_id={self.playlist_id}, video_id={self.video_id}, position={self.position})>"

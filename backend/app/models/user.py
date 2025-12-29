from sqlalchemy import Column, String, Boolean, BigInteger, DateTime, Enum
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid
import enum
from app.database import Base


class UserRole(str, enum.Enum):
    USER = "user"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.USER, nullable=False)
    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    is_active = Column(Boolean, default=True, nullable=False)
    avatar_filename = Column(String(255), nullable=True)

    # Upload quota tracking (for future video uploads)
    weekly_upload_bytes = Column(BigInteger, default=0, nullable=False)
    last_upload_reset = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )

    # Relationships
    invitations = relationship(
        "Invitation", back_populates="creator", cascade="all, delete-orphan"
    )
    categories = relationship(
        "Category", back_populates="creator", cascade="all, delete-orphan"
    )
    videos = relationship(
        "Video", back_populates="uploader", cascade="all, delete-orphan"
    )
    playlists = relationship(
        "Playlist", back_populates="creator", cascade="all, delete-orphan"
    )
    comments = relationship(
        "Comment", back_populates="author", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<User(id={self.id}, username={self.username}, role={self.role})>"

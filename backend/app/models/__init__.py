"""
Database models for Clipset.

Import all models here to ensure they're registered with SQLAlchemy Base.
"""

from app.models.user import User, UserRole
from app.models.invitation import Invitation
from app.models.category import Category
from app.models.video import Video, ProcessingStatus
from app.models.config import Config
from app.models.playlist import Playlist, PlaylistVideo

__all__ = [
    "User",
    "UserRole",
    "Invitation",
    "Category",
    "Video",
    "ProcessingStatus",
    "Config",
    "Playlist",
    "PlaylistVideo",
]

"""
Pydantic schemas for Playlist API.
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime


class PlaylistCreate(BaseModel):
    """Schema for creating a new playlist."""

    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)

    @field_validator("name", "description")
    @classmethod
    def validate_strings(cls, v: Optional[str]) -> Optional[str]:
        """Trim whitespace from strings."""
        if v:
            return v.strip()
        return v


class PlaylistUpdate(BaseModel):
    """Schema for updating playlist metadata."""

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)

    @field_validator("name", "description")
    @classmethod
    def validate_strings(cls, v: Optional[str]) -> Optional[str]:
        """Trim whitespace from strings."""
        if v:
            return v.strip()
        return v


class PlaylistVideoAdd(BaseModel):
    """Schema for adding a video to a playlist."""

    video_id: str
    position: Optional[int] = None  # If None, append to end


class PlaylistReorderRequest(BaseModel):
    """Schema for reordering videos in a playlist."""

    video_positions: List[dict] = Field(
        ..., description="List of {video_id, position} objects"
    )


class PlaylistResponse(BaseModel):
    """Schema for playlist response with metadata."""

    id: str
    name: str
    description: Optional[str]
    created_by: str
    creator_username: str  # Joined from User
    video_count: int  # Aggregated count
    created_at: datetime
    updated_at: datetime
    first_video_thumbnail: Optional[str] = None  # For cover image

    model_config = {"from_attributes": True}


class PlaylistListResponse(BaseModel):
    """Schema for list of playlists response."""

    playlists: List[PlaylistResponse]
    total: int


# Import VideoResponse to avoid circular import
from app.schemas.video import VideoResponse


class PlaylistVideoResponse(BaseModel):
    """Schema for a video in a playlist with position."""

    id: str
    playlist_id: str
    video_id: str
    position: int
    added_at: datetime
    added_by: Optional[str]
    video: VideoResponse  # Full video details

    model_config = {"from_attributes": True}


class PlaylistWithVideosResponse(PlaylistResponse):
    """Schema for playlist with all videos."""

    videos: List[PlaylistVideoResponse]

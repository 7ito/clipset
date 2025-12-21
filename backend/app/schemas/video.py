"""
Pydantic schemas for Video API.
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime


class VideoUploadMetadata(BaseModel):
    """Schema for video upload metadata (form fields)."""

    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    category_id: Optional[str] = None

    @field_validator("title", "description")
    @classmethod
    def validate_strings(cls, v: Optional[str]) -> Optional[str]:
        """Trim whitespace from strings."""
        if v:
            return v.strip()
        return v


class VideoUpdate(BaseModel):
    """Schema for updating video metadata."""

    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    category_id: Optional[str] = None

    @field_validator("title", "description")
    @classmethod
    def validate_strings(cls, v: Optional[str]) -> Optional[str]:
        """Trim whitespace from strings."""
        if v:
            return v.strip()
        return v


class VideoResponse(BaseModel):
    """Schema for video response with all details."""

    # Video model fields
    id: str
    title: str
    description: Optional[str]
    filename: str
    thumbnail_filename: Optional[str]
    original_filename: str
    storage_path: Optional[str]
    file_size_bytes: int
    duration_seconds: Optional[int]
    uploaded_by: str
    category_id: Optional[str]
    view_count: int
    processing_status: str  # ProcessingStatus enum value
    error_message: Optional[str]
    created_at: datetime

    # Joined data from relationships
    uploader_username: str
    category_name: Optional[str] = None
    category_slug: Optional[str] = None

    model_config = {"from_attributes": True}


class VideoListResponse(BaseModel):
    """Schema for paginated video list response."""

    videos: List[VideoResponse]
    total: int


class QuotaInfoResponse(BaseModel):
    """Schema for user quota information."""

    used_bytes: int
    limit_bytes: int
    remaining_bytes: int
    percentage_used: float
    can_upload: bool
    max_file_size_bytes: int


class ViewCountResponse(BaseModel):
    """Schema for view count increment response."""

    view_count: int


class QuotaResetResponse(BaseModel):
    """Schema for quota reset response (admin only)."""

    reset_count: int
    message: str

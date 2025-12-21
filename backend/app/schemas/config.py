"""
Pydantic schemas for Config endpoints.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator
from app.schemas.base import BaseResponse


class ConfigResponse(BaseResponse):
    """Schema for reading system configuration."""

    # Upload & Storage Settings
    max_file_size_bytes: int = Field(
        ..., description="Maximum file size for video uploads in bytes"
    )
    weekly_upload_limit_bytes: int = Field(
        ..., description="Weekly upload quota limit per user in bytes"
    )
    video_storage_path: str = Field(..., description="Path where videos are stored")

    # Metadata
    updated_at: datetime = Field(..., description="Last update timestamp")
    updated_by: Optional[str] = Field(None, description="User ID who last updated")


class ConfigUpdate(BaseModel):
    """Schema for updating system configuration (all fields optional)."""

    max_file_size_bytes: Optional[int] = Field(
        None,
        ge=1_048_576,  # Minimum 1MB
        le=10_737_418_240,  # Maximum 10GB
        description="Maximum file size for video uploads in bytes",
    )
    weekly_upload_limit_bytes: Optional[int] = Field(
        None,
        ge=1_048_576,  # Minimum 1MB
        le=107_374_182_400,  # Maximum 100GB
        description="Weekly upload quota limit per user in bytes",
    )
    video_storage_path: Optional[str] = Field(
        None,
        min_length=1,
        max_length=500,
        description="Path where videos are stored",
    )

    @field_validator("video_storage_path")
    @classmethod
    def validate_path(cls, v: Optional[str]) -> Optional[str]:
        """Validate storage path format."""
        if v is None:
            return v

        v = v.strip()
        if not v:
            raise ValueError("Storage path cannot be empty")

        # Basic path validation (no null bytes, etc.)
        if "\x00" in v:
            raise ValueError("Storage path contains invalid characters")

        return v

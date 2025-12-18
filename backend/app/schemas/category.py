"""
Pydantic schemas for Category endpoints.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator
import uuid


class CategoryBase(BaseModel):
    """Base category schema with common fields."""

    name: str = Field(..., min_length=1, max_length=50, description="Category name")


class CategoryCreate(CategoryBase):
    """Schema for creating a new category."""

    description: Optional[str] = Field(
        None, max_length=500, description="Category description"
    )

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Validate and clean category name."""
        v = v.strip()
        if not v:
            raise ValueError("Category name cannot be empty")
        return v


class CategoryUpdate(BaseModel):
    """Schema for updating a category."""

    name: Optional[str] = Field(
        None, min_length=1, max_length=50, description="New category name"
    )
    description: Optional[str] = Field(
        None, max_length=500, description="Category description"
    )

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        """Validate and clean category name."""
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Category name cannot be empty")
        return v


class CategoryResponse(CategoryBase):
    """Schema for category responses."""

    id: uuid.UUID
    slug: str
    description: Optional[str] = None
    image_filename: Optional[str] = None
    image_url: Optional[str] = None
    created_by: uuid.UUID
    created_at: datetime
    updated_at: Optional[datetime] = None
    video_count: int = Field(default=0, description="Number of videos in this category")

    class Config:
        from_attributes = True


class CategoryListResponse(BaseModel):
    """Schema for list of categories."""

    categories: list[CategoryResponse]
    total: int

from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime, timezone
from app.schemas.base import BaseResponse


class CommentCreate(BaseModel):
    """Schema for creating a new comment or reply."""

    content: str = Field(..., min_length=1, max_length=2000)
    timestamp_seconds: Optional[int] = Field(None, ge=0)
    parent_id: Optional[str] = None

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: str) -> str:
        """Trim whitespace from content."""
        return v.strip()


class CommentUpdate(BaseModel):
    """Schema for updating an existing comment."""

    content: str = Field(..., min_length=1, max_length=2000)

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: str) -> str:
        """Trim whitespace from content."""
        return v.strip()


class CommentResponse(BaseResponse):
    """Schema for comment response with metadata and author info."""

    id: str
    video_id: str
    content: str
    timestamp_seconds: Optional[int]
    parent_id: Optional[str]
    user_id: str
    author_username: str
    author_avatar_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    # Computed fields
    is_edited: bool = False
    can_edit: bool = False
    can_delete: bool = False
    reply_count: int = 0
    replies: Optional[List["CommentResponse"]] = None

    @classmethod
    def from_orm_with_extras(
        cls,
        comment,
        current_user_id: Optional[str] = None,
        video_owner_id: Optional[str] = None,
        is_admin: bool = False,
        include_replies: bool = False,
    ):
        """Helper to create response from ORM with computed permission fields."""
        now = datetime.now(timezone.utc)

        # Ensure comment timestamps are timezone-aware for comparison
        created_at = comment.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)

        updated_at = comment.updated_at
        if updated_at.tzinfo is None:
            updated_at = updated_at.replace(tzinfo=timezone.utc)

        # Check if edited (buffer of 60 seconds)
        is_edited = (updated_at - created_at).total_seconds() > 60

        # Check if can edit (author only, within 24 hours)
        can_edit = (
            current_user_id == comment.user_id
            and (now - created_at).total_seconds() < 86400
        )

        # Check if can delete (author, video owner, or admin)
        can_delete = (
            is_admin
            or current_user_id == comment.user_id
            or current_user_id == video_owner_id
        )

        # Build avatar URL if filename exists
        author_avatar_url = None
        if comment.author.avatar_filename:
            author_avatar_url = f"/media/avatars/{comment.author.avatar_filename}"

        replies = None
        if include_replies and comment.replies:
            replies = [
                cls.from_orm_with_extras(
                    r,
                    current_user_id=current_user_id,
                    video_owner_id=video_owner_id,
                    is_admin=is_admin,
                    include_replies=False,  # Only one level of nesting
                )
                for r in comment.replies
            ]

        return cls(
            id=comment.id,
            video_id=comment.video_id,
            content=comment.content,
            timestamp_seconds=comment.timestamp_seconds,
            parent_id=comment.parent_id,
            user_id=comment.user_id,
            author_username=comment.author.username,
            author_avatar_url=author_avatar_url,
            created_at=comment.created_at,
            updated_at=comment.updated_at,
            is_edited=is_edited,
            can_edit=can_edit,
            can_delete=can_delete,
            reply_count=len(comment.replies) if not comment.parent_id else 0,
            replies=replies,
        )


class CommentListResponse(BaseModel):
    """Schema for list of comments response."""

    comments: List[CommentResponse]
    total: int
    has_more: bool


class CommentMarker(BaseModel):
    """Schema for video progress bar markers."""

    seconds: int
    count: int

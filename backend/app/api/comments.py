from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload
from typing import List, Optional
from datetime import datetime, timezone

from app.database import get_db
from app.models.user import User
from app.models.video import Video
from app.models.comment import Comment
from app.schemas.comment import (
    CommentCreate,
    CommentUpdate,
    CommentResponse,
    CommentListResponse,
    CommentMarker,
)
from app.api.deps import get_current_user

router = APIRouter()


async def get_video_or_404(video_id: str, db: AsyncSession) -> Video:
    """Helper to get video or raise 404."""
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Video not found: {video_id}",
        )
    return video


async def get_comment_or_404(comment_id: str, db: AsyncSession) -> Comment:
    """Helper to get comment or raise 404."""
    result = await db.execute(
        select(Comment)
        .options(
            joinedload(Comment.author),
            joinedload(Comment.video),
            selectinload(Comment.replies),
        )
        .where(Comment.id == comment_id)
    )
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Comment not found: {comment_id}",
        )
    return comment


@router.get("/videos/{video_id}/comments", response_model=CommentListResponse)
async def get_video_comments(
    video_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    sort: str = Query("newest", regex="^(newest|oldest|timestamp)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get top-level comments for a video with their replies.
    """
    video = await get_video_or_404(video_id, db)

    # Base query for top-level comments
    query = (
        select(Comment)
        .options(
            joinedload(Comment.author),
            selectinload(Comment.replies).joinedload(Comment.author),
        )
        .where(Comment.video_id == video_id)
        .where(Comment.parent_id == None)
    )

    # Apply sorting
    if sort == "newest":
        query = query.order_by(desc(Comment.created_at))
    elif sort == "oldest":
        query = query.order_by(asc(Comment.created_at))
    elif sort == "timestamp":
        # Sort by timestamp (nulls last)
        query = query.order_by(
            Comment.timestamp_seconds.asc().nullslast(), desc(Comment.created_at)
        )

    # Get total count
    count_query = (
        select(func.count(Comment.id))
        .where(Comment.video_id == video_id)
        .where(Comment.parent_id == None)
    )
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Get paginated results
    result = await db.execute(query.offset(skip).limit(limit))
    comments_orm = result.scalars().all()

    # Build responses
    comments = [
        CommentResponse.from_orm_with_extras(
            c,
            current_user_id=current_user.id,
            video_owner_id=video.uploaded_by,
            is_admin=current_user.role == "admin",
            include_replies=True,
        )
        for c in comments_orm
    ]

    return CommentListResponse(
        comments=comments, total=total, has_more=total > (skip + limit)
    )


@router.post(
    "/videos/{video_id}/comments",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_comment(
    video_id: str,
    comment_data: CommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new comment or reply.
    """
    video = await get_video_or_404(video_id, db)

    # If replying, validate parent comment
    if comment_data.parent_id:
        parent = await get_comment_or_404(comment_data.parent_id, db)
        if parent.video_id != video_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Parent comment must belong to the same video",
            )
        if parent.parent_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nested replies are not supported",
            )

    comment = Comment(
        video_id=video_id,
        user_id=current_user.id,
        content=comment_data.content,
        timestamp_seconds=comment_data.timestamp_seconds,
        parent_id=comment_data.parent_id,
    )

    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    # Reload with author for response
    comment = await get_comment_or_404(comment.id, db)

    return CommentResponse.from_orm_with_extras(
        comment,
        current_user_id=current_user.id,
        video_owner_id=video.uploaded_by,
        is_admin=current_user.role == "admin",
    )


@router.patch("/comments/{comment_id}", response_model=CommentResponse)
async def update_comment(
    comment_id: str,
    comment_data: CommentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update a comment. Only the author can update, and only within 24 hours.
    """
    comment = await get_comment_or_404(comment_id, db)

    # Validate author
    if comment.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own comments",
        )

    # Validate timeframe (24 hours)
    now = datetime.now(timezone.utc)
    created_at = comment.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    if (now - created_at).total_seconds() > 86400:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Comment editing window (24h) has expired",
        )

    comment.content = comment_data.content
    await db.commit()
    await db.refresh(comment)

    return CommentResponse.from_orm_with_extras(
        comment,
        current_user_id=current_user.id,
        video_owner_id=comment.video.uploaded_by,
        is_admin=current_user.role == "admin",
    )


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a comment. Author, video owner, or admin can delete.
    """
    comment = await get_comment_or_404(comment_id, db)

    # Validate permissions
    is_author = comment.user_id == current_user.id
    is_video_owner = comment.video.uploaded_by == current_user.id
    is_admin = current_user.role == "admin"

    if not (is_author or is_video_owner or is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to delete this comment",
        )

    await db.delete(comment)
    await db.commit()

    return None


@router.get("/videos/{video_id}/comment-markers", response_model=List[CommentMarker])
async def get_comment_markers(
    video_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get aggregated comment timestamps for video progress bar.
    """
    await get_video_or_404(video_id, db)

    query = (
        select(Comment.timestamp_seconds, func.count(Comment.id).label("count"))
        .where(Comment.video_id == video_id)
        .where(Comment.timestamp_seconds != None)
        .group_by(Comment.timestamp_seconds)
        .order_by(asc(Comment.timestamp_seconds))
    )

    result = await db.execute(query)
    rows = result.all()

    return [CommentMarker(seconds=row[0], count=row[1]) for row in rows]

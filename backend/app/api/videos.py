"""
Video API endpoints.

Handles video upload, listing, streaming, and management.
"""

import logging
import asyncio
from pathlib import Path
from typing import Optional
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    Form,
    BackgroundTasks,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.api.deps import (
    get_db,
    get_current_user,
    require_admin,
    get_user_from_token_or_query,
)
from app.models.user import User
from app.models.video import Video, ProcessingStatus
from app.models.category import Category
from app.schemas.video import (
    VideoResponse,
    VideoListResponse,
    VideoUpdate,
    QuotaInfoResponse,
    ViewCountResponse,
    QuotaResetResponse,
    ChunkUploadInitResponse,
    ChunkUploadCompleteRequest,
)
from app.services import storage, upload_quota, chunk_manager
from app.services.config import get_or_create_config
from app.services.background_tasks import process_video_task
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


# Dependency functions
async def get_video_or_404(short_id: str, db: AsyncSession) -> Video:
    """Get video by short_id or raise 404."""
    result = await db.execute(select(Video).where(Video.short_id == short_id))
    video = result.scalar_one_or_none()

    if not video:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Video not found: {short_id}"
        )

    return video


async def require_video_owner_or_admin(video: Video, current_user: User) -> None:
    """Require that the current user is the video owner or an admin."""
    is_owner = video.uploaded_by == current_user.id
    is_admin = current_user.role == "admin"

    if not (is_owner or is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this video",
        )


def build_video_response(
    video: Video, uploader: User, category: Optional[Category]
) -> dict:
    """Build video response dict with joined data."""
    return {
        # Video fields
        "id": video.id,
        "short_id": video.short_id,
        "title": video.title,
        "description": video.description,
        "filename": video.filename,
        "thumbnail_filename": video.thumbnail_filename,
        "original_filename": video.original_filename,
        "file_size_bytes": video.file_size_bytes,
        "duration_seconds": video.duration_seconds,
        "uploaded_by": video.uploaded_by,
        "category_id": video.category_id,
        "view_count": video.view_count,
        "processing_status": video.processing_status.value,
        "error_message": video.error_message,
        "storage_path": video.storage_path,
        "created_at": video.created_at,
        # Joined data
        "uploader_username": uploader.username,
        "category_name": category.name if category else None,
        "category_slug": category.slug if category else None,
    }


@router.post(
    "/upload", response_model=VideoResponse, status_code=status.HTTP_201_CREATED
)
async def upload_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(...),
    description: Optional[str] = Form(None),
    category_id: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a video file.

    Steps:
    1. Validate file type and size
    2. Check user quota
    3. Save file to temp storage
    4. Create Video record
    5. Increment user quota
    6. Trigger background processing
    """
    # Validate file extension
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No filename provided"
        )

    file_ext = Path(file.filename).suffix.lower().lstrip(".")
    if file_ext not in settings.accepted_formats:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Accepted formats: {', '.join(settings.accepted_formats)}",
        )

    # Check file size (read from file if not provided)
    file_size = 0
    if hasattr(file, "size") and file.size:
        file_size = file.size
    else:
        # Estimate size by reading file
        file.file.seek(0, 2)  # Seek to end
        file_size = file.file.tell()
        file.file.seek(0)  # Reset to beginning

    # Get config for max file size
    try:
        config = await get_or_create_config(db)
        max_file_size_limit = config.max_file_size_bytes
    except Exception as e:
        logger.warning(f"Failed to fetch DB config, using env default: {e}")
        max_file_size_limit = settings.MAX_FILE_SIZE_BYTES

    if file_size > max_file_size_limit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {max_file_size_limit / (1024**3):.2f} GB",
        )

    # Check user quota
    can_upload, reason = await upload_quota.check_user_quota(
        db, current_user, file_size
    )
    if not can_upload:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=reason)

    # Validate category if provided
    if category_id:
        result = await db.execute(select(Category).where(Category.id == category_id))
        category = result.scalar_one_or_none()
        if not category:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Category not found: {category_id}",
            )

    try:
        # Ensure storage directories exist
        storage.ensure_directories()

        # Generate unique filename
        unique_filename = storage.generate_unique_filename(file.filename)

        # Save to temp storage
        temp_path = Path(settings.TEMP_STORAGE_PATH) / unique_filename
        bytes_written = storage.save_uploaded_file(file, temp_path)

        logger.info(f"Saved uploaded file to temp: {temp_path} ({bytes_written} bytes)")

        # Create Video record with PENDING status
        video = Video(
            title=title.strip(),
            description=description.strip() if description else None,
            filename=unique_filename,
            original_filename=file.filename,
            file_size_bytes=bytes_written,
            uploaded_by=current_user.id,
            category_id=category_id,
            processing_status=ProcessingStatus.PENDING,
            storage_path=config.video_storage_path,
        )

        db.add(video)
        await db.commit()
        await db.refresh(video)

        # Increment user quota
        await upload_quota.increment_user_quota(db, current_user.id, bytes_written)

        # Trigger background processing
        background_tasks.add_task(process_video_task, video.id)

        logger.info(
            f"Video uploaded successfully: {video.id} by {current_user.username}"
        )

        # Build response
        response_dict = build_video_response(
            video, current_user, category if category_id else None
        )
        return VideoResponse(**response_dict)

    except Exception as e:
        logger.error(f"Error uploading video: {e}", exc_info=True)
        # Cleanup temp file if it exists
        try:
            if "temp_path" in locals() and temp_path.exists():
                storage.delete_file(temp_path)
        except:
            pass

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload video: {str(e)}",
        )


@router.post("/upload/init", response_model=ChunkUploadInitResponse)
async def init_chunk_upload(
    current_user: User = Depends(get_current_user),
):
    """Initialize a chunked upload session."""
    upload_id = chunk_manager.init_upload_session()
    return ChunkUploadInitResponse(upload_id=upload_id)


@router.post("/upload/chunk", status_code=status.HTTP_204_NO_CONTENT)
async def upload_video_chunk(
    upload_id: str = Form(...),
    chunk_index: int = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload a single video chunk."""
    try:
        chunk_data = await file.read()
        chunk_manager.save_chunk(upload_id, chunk_index, chunk_data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error(f"Error saving chunk {chunk_index} for upload {upload_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save chunk: {str(e)}",
        )


@router.post("/upload/complete", response_model=VideoResponse)
async def complete_chunk_upload(
    request: ChunkUploadCompleteRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Complete a chunked upload, merge chunks and start processing."""
    # Get config for path and size limits
    config = await get_or_create_config(db)

    # 1. Merge chunks to temp path
    unique_filename = storage.generate_unique_filename(request.filename)
    temp_path = Path(settings.TEMP_STORAGE_PATH) / unique_filename

    try:
        # Ensure directories exist
        storage.ensure_directories()

        total_size = chunk_manager.merge_chunks(request.upload_id, temp_path)

        # 2. Validate total size against quota and limits
        if total_size > config.max_file_size_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File too large. Maximum size: {config.max_file_size_bytes / (1024**3):.2f} GB",
            )

        can_upload, reason = await upload_quota.check_user_quota(
            db, current_user, total_size
        )
        if not can_upload:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=reason)

        # 3. Validate category if provided
        if request.category_id:
            result = await db.execute(
                select(Category).where(Category.id == request.category_id)
            )
            category = result.scalar_one_or_none()
            if not category:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Category not found: {request.category_id}",
                )

        # 4. Create Video record
        video = Video(
            title=request.title.strip(),
            description=request.description.strip() if request.description else None,
            filename=unique_filename,
            original_filename=request.filename,
            file_size_bytes=total_size,
            uploaded_by=current_user.id,
            category_id=request.category_id,
            processing_status=ProcessingStatus.PENDING,
            storage_path=config.video_storage_path,
        )

        db.add(video)
        await db.commit()
        await db.refresh(video)

        # 5. Increment user quota
        await upload_quota.increment_user_quota(db, current_user.id, total_size)

        # 6. Trigger background processing
        background_tasks.add_task(process_video_task, video.id)

        # 7. Cleanup session chunks
        chunk_manager.cleanup_session(request.upload_id)

        # 8. Build response
        uploader_result = await db.execute(
            select(User).where(User.id == video.uploaded_by)
        )
        uploader = uploader_result.scalar_one()

        category = None
        if video.category_id:
            category_result = await db.execute(
                select(Category).where(Category.id == video.category_id)
            )
            category = category_result.scalar_one_or_none()

        response_dict = build_video_response(video, uploader, category)
        return VideoResponse(**response_dict)

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error completing chunked upload: {e}", exc_info=True)
        # Cleanup
        if temp_path.exists():
            storage.delete_file(temp_path)
        chunk_manager.cleanup_session(request.upload_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to complete upload: {str(e)}",
        )


@router.get("/", response_model=VideoListResponse)
async def list_videos(
    category_id: Optional[str] = None,
    status: Optional[str] = None,
    uploaded_by: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
    sort: str = "created_at",
    order: str = "desc",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List videos with filtering and pagination.

    Non-admin users can only see:
    - COMPLETED videos from all users
    - Their own videos in any status

    Admins can see all videos in any status.
    """
    # Build base query
    query = (
        select(Video, User, Category)
        .join(User, Video.uploaded_by == User.id)
        .outerjoin(Category, Video.category_id == Category.id)
    )

    # Apply access control
    if current_user.role != "admin":
        # Non-admin users: only COMPLETED videos OR their own videos
        query = query.where(
            or_(
                Video.processing_status == ProcessingStatus.COMPLETED,
                Video.uploaded_by == current_user.id,
            )
        )

    # Apply filters
    if category_id:
        query = query.where(Video.category_id == category_id)

    if status and current_user.role == "admin":
        # Only admins can filter by status
        try:
            status_enum = ProcessingStatus(status)
            query = query.where(Video.processing_status == status_enum)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status: {status}",
            )

    if uploaded_by:
        query = query.where(Video.uploaded_by == uploaded_by)

    if search:
        query = query.where(Video.title.ilike(f"%{search}%"))

    # Apply sorting
    if sort == "created_at":
        order_column = Video.created_at
    elif sort == "title":
        order_column = Video.title
    elif sort == "view_count":
        order_column = Video.view_count
    else:
        order_column = Video.created_at

    if order == "asc":
        query = query.order_by(order_column.asc())
    else:
        query = query.order_by(order_column.desc())

    # Get total count
    count_query = select(func.count()).select_from(Video)
    if current_user.role != "admin":
        count_query = count_query.where(
            or_(
                Video.processing_status == ProcessingStatus.COMPLETED,
                Video.uploaded_by == current_user.id,
            )
        )
    if category_id:
        count_query = count_query.where(Video.category_id == category_id)
    if uploaded_by:
        count_query = count_query.where(Video.uploaded_by == uploaded_by)
    if search:
        count_query = count_query.where(Video.title.ilike(f"%{search}%"))

    total_result = await db.execute(count_query)
    total = total_result.scalar()

    # Apply pagination
    query = query.offset(skip).limit(limit)

    # Execute query
    result = await db.execute(query)
    rows = result.all()

    # Build response
    videos = []
    for video, uploader, category in rows:
        video_dict = build_video_response(video, uploader, category)
        videos.append(VideoResponse(**video_dict))

    return VideoListResponse(videos=videos, total=total)


@router.get("/{short_id}", response_model=VideoResponse)
async def get_video(
    short_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single video by short_id."""
    video = await get_video_or_404(short_id, db)

    # Check access: admins can view any video, users can view COMPLETED or their own
    if current_user.role != "admin":
        is_completed = video.processing_status == ProcessingStatus.COMPLETED
        is_owner = video.uploaded_by == current_user.id

        if not (is_completed or is_owner):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to view this video",
            )

    # Fetch uploader and category
    uploader_result = await db.execute(select(User).where(User.id == video.uploaded_by))
    uploader = uploader_result.scalar_one()

    category = None
    if video.category_id:
        category_result = await db.execute(
            select(Category).where(Category.id == video.category_id)
        )
        category = category_result.scalar_one_or_none()

    video_dict = build_video_response(video, uploader, category)
    return VideoResponse(**video_dict)


@router.patch("/{short_id}", response_model=VideoResponse)
async def update_video(
    short_id: str,
    updates: VideoUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update video metadata (owner or admin only)."""
    video = await get_video_or_404(short_id, db)
    await require_video_owner_or_admin(video, current_user)

    # Apply updates
    update_data = updates.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        if field == "category_id" and value:
            # Validate category exists
            result = await db.execute(select(Category).where(Category.id == value))
            category = result.scalar_one_or_none()
            if not category:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Category not found: {value}",
                )

        setattr(video, field, value)

    await db.commit()
    await db.refresh(video)

    # Fetch uploader and category for response
    uploader_result = await db.execute(select(User).where(User.id == video.uploaded_by))
    uploader = uploader_result.scalar_one()

    category = None
    if video.category_id:
        category_result = await db.execute(
            select(Category).where(Category.id == video.category_id)
        )
        category = category_result.scalar_one_or_none()

    video_dict = build_video_response(video, uploader, category)
    return VideoResponse(**video_dict)


@router.delete("/{short_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_video(
    short_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a video (owner or admin only)."""
    video = await get_video_or_404(short_id, db)
    await require_video_owner_or_admin(video, current_user)

    # Delete files
    video_storage_base = Path(video.storage_path or settings.VIDEO_STORAGE_PATH)
    video_path = video_storage_base / video.filename
    storage.delete_file(video_path)

    if video.thumbnail_filename:
        thumbnail_path = (
            Path(settings.THUMBNAIL_STORAGE_PATH) / video.thumbnail_filename
        )
        storage.delete_file(thumbnail_path)

    # Delete database record
    await db.delete(video)
    await db.commit()

    logger.info(f"Deleted video {video.id} by {current_user.username}")


@router.get("/{short_id}/stream")
async def stream_video(
    short_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user_from_token_or_query),
):
    """Stream video file with Range header support."""
    video = await get_video_or_404(short_id, db)

    # Check access
    if current_user.role != "admin":
        is_completed = video.processing_status == ProcessingStatus.COMPLETED
        is_owner = video.uploaded_by == current_user.id

        if not (is_completed or is_owner):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Video is not available for streaming",
            )

    # Get video file path
    video_storage_base = Path(video.storage_path or settings.VIDEO_STORAGE_PATH)
    video_path = video_storage_base / video.filename

    if not video_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Video file not found"
        )

    # Return file response with Range header support
    return FileResponse(
        path=video_path,
        media_type="video/mp4",
        filename=video.original_filename,
        headers={"Accept-Ranges": "bytes"},
    )


@router.get("/{short_id}/thumbnail")
async def get_thumbnail(
    short_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user_from_token_or_query),
):
    """Get video thumbnail image."""
    video = await get_video_or_404(short_id, db)

    if not video.thumbnail_filename:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Thumbnail not available"
        )

    thumbnail_path = Path(settings.THUMBNAIL_STORAGE_PATH) / video.thumbnail_filename

    if not thumbnail_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Thumbnail file not found"
        )

    return FileResponse(
        path=thumbnail_path,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.post("/{short_id}/view", response_model=ViewCountResponse)
async def increment_view_count(
    short_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Increment video view count."""
    video = await get_video_or_404(short_id, db)

    video.view_count += 1
    await db.commit()

    return ViewCountResponse(view_count=video.view_count)


@router.get("/quota/me", response_model=QuotaInfoResponse)
async def get_my_quota(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get current user's quota information."""
    quota_info = await upload_quota.get_quota_info(db, current_user)
    return QuotaInfoResponse(**quota_info)


@router.post("/admin/quota/reset-all", response_model=QuotaResetResponse)
async def reset_all_quotas(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """Reset all users' upload quotas (admin only)."""
    count = await upload_quota.reset_all_quotas(db)

    return QuotaResetResponse(
        reset_count=count, message=f"Successfully reset quotas for {count} users"
    )

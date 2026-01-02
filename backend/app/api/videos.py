"""
Video API endpoints.

Handles video upload, listing, streaming, and management.
"""

import logging
import asyncio
import os
import re
from pathlib import Path
from typing import Optional, Generator, BinaryIO, Tuple
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    Form,
    BackgroundTasks,
    Request,
    status,
)
from fastapi.responses import FileResponse, StreamingResponse, Response
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

# Default chunk size for streaming (8KB)
STREAM_CHUNK_SIZE = 8 * 1024


def send_bytes_range_requests(
    file_obj: BinaryIO, start: int, end: int, chunk_size: int = STREAM_CHUNK_SIZE
) -> Generator[bytes, None, None]:
    """
    Send a file in chunks using Range Requests specification RFC7233.

    `start` and `end` parameters are inclusive due to specification.
    """
    with file_obj as f:
        f.seek(start)
        while (pos := f.tell()) <= end:
            read_size = min(chunk_size, end - pos + 1)
            yield f.read(read_size)


def parse_range_header(range_header: str, file_size: int) -> Tuple[int, int]:
    """
    Parse Range header and return (start, end) byte positions.

    Raises HTTPException if range is invalid.
    """
    try:
        h = range_header.replace("bytes=", "").split("-")
        start = int(h[0]) if h[0] != "" else 0
        end = int(h[1]) if h[1] != "" else file_size - 1
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
            detail=f"Invalid request range (Range: {range_header!r})",
        )

    if start > end or start < 0 or end >= file_size:
        raise HTTPException(
            status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
            detail=f"Invalid request range (Range: {range_header!r})",
        )

    return start, end


def range_requests_response(
    request: Request, file_path: Path, content_type: str
) -> Response:
    """
    Returns StreamingResponse using Range Requests of a given file.

    Handles both full file requests (HTTP 200) and partial content requests (HTTP 206).
    """
    file_size = os.stat(file_path).st_size
    range_header = request.headers.get("range")

    headers = {
        "content-type": content_type,
        "accept-ranges": "bytes",
        "content-encoding": "identity",
        "content-length": str(file_size),
        "access-control-expose-headers": (
            "content-type, accept-ranges, content-length, "
            "content-range, content-encoding"
        ),
    }

    start = 0
    end = file_size - 1
    status_code = status.HTTP_200_OK

    if range_header is not None:
        start, end = parse_range_header(range_header, file_size)
        size = end - start + 1
        headers["content-length"] = str(size)
        headers["content-range"] = f"bytes {start}-{end}/{file_size}"
        status_code = status.HTTP_206_PARTIAL_CONTENT

    return StreamingResponse(
        send_bytes_range_requests(open(file_path, mode="rb"), start, end),
        headers=headers,
        status_code=status_code,
    )


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

    # Try to delete HLS directory first
    hls_deleted = storage.delete_hls_directory(video_storage_base, video.filename)

    # Try to delete progressive MP4 file
    # Check both with and without .mp4 extension (for legacy files)
    video_path = video_storage_base / video.filename
    if not video_path.suffix:
        video_path = video_storage_base / f"{video.filename}.mp4"
    storage.delete_file(video_path)

    # Also try deleting if filename already has extension
    if video.filename.endswith(".mp4"):
        storage.delete_file(video_storage_base / video.filename)

    if video.thumbnail_filename:
        thumbnail_path = (
            Path(settings.THUMBNAIL_STORAGE_PATH) / video.thumbnail_filename
        )
        storage.delete_file(thumbnail_path)

    # Delete database record
    await db.delete(video)
    await db.commit()

    logger.info(
        f"Deleted video {video.id} by {current_user.username} "
        f"(HLS deleted: {hls_deleted})"
    )


@router.get("/{short_id}/stream")
async def stream_video(
    short_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user_from_token_or_query),
):
    """
    Stream video file with HTTP Range request support.

    Supports partial content (HTTP 206) for seeking to any position in the video,
    even if that position hasn't been buffered yet.
    """
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

    # Return streaming response with proper Range header handling
    return range_requests_response(request, video_path, "video/mp4")


@router.get("/{short_id}/hls/{filename:path}")
async def stream_hls(
    short_id: str,
    filename: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user_from_token_or_query),
):
    """
    Serve HLS manifest (.m3u8) or segment (.ts) files.

    This endpoint handles requests for:
    - master.m3u8 - The HLS manifest file
    - segment000.ts, segment001.ts, etc. - The video segments
    """
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

    # Get HLS directory path
    # For HLS videos, video.filename is the directory name (stem without extension)
    video_storage_base = Path(video.storage_path or settings.VIDEO_STORAGE_PATH)
    hls_dir = video_storage_base / video.filename

    # Validate filename to prevent directory traversal
    if ".." in filename or filename.startswith("/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid filename",
        )

    file_path = hls_dir / filename

    if not file_path.exists():
        # Check if this is a progressive video (not HLS)
        progressive_path = video_storage_base / f"{video.filename}.mp4"
        if progressive_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="This video uses progressive streaming, not HLS",
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="HLS file not found",
        )

    # Determine content type based on file extension
    if filename.endswith(".m3u8"):
        content_type = "application/vnd.apple.mpegurl"
        # M3U8 files should not be cached as aggressively
        cache_control = "public, max-age=2"

        # For native HLS players (Safari/iOS), we need to rewrite the manifest
        # to include the auth token in segment URLs, since native players
        # don't support custom headers and don't preserve query params from
        # the manifest URL when requesting segments
        token = request.query_params.get("token")
        if token:
            # Read the manifest file
            with open(file_path, "r") as f:
                manifest_content = f.read()

            # Rewrite segment URLs to include the token
            # Segments are referenced as relative paths like "segment000.ts"
            def add_token_to_segment(match):
                segment_name = match.group(0)
                return f"{segment_name}?token={token}"

            # Match .ts files (segment files) that don't already have query params
            rewritten_manifest = re.sub(
                r"(segment\d+\.ts)(?!\?)", add_token_to_segment, manifest_content
            )

            return Response(
                content=rewritten_manifest,
                media_type=content_type,
                headers={"Cache-Control": cache_control},
            )
    elif filename.endswith(".ts"):
        content_type = "video/mp2t"
        # Segments can be cached longer since they don't change
        cache_control = "public, max-age=86400"
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid HLS file type",
        )

    return FileResponse(
        path=file_path,
        media_type=content_type,
        headers={"Cache-Control": cache_control},
    )


@router.get("/{short_id}/stream-info")
async def get_stream_info(
    short_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user_from_token_or_query),
):
    """
    Get information about how to stream this video.

    Returns whether the video uses HLS or progressive streaming,
    along with the appropriate URL to use.
    """
    video = await get_video_or_404(short_id, db)

    # Check access
    if current_user.role != "admin":
        is_completed = video.processing_status == ProcessingStatus.COMPLETED
        is_owner = video.uploaded_by == current_user.id

        if not (is_completed or is_owner):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Video is not available",
            )

    # Determine if this video has HLS files
    video_storage_base = Path(video.storage_path or settings.VIDEO_STORAGE_PATH)

    # Check for HLS directory with manifest
    hls_dir = video_storage_base / video.filename
    hls_manifest = hls_dir / "master.m3u8"

    # Check for progressive MP4 file
    progressive_path = video_storage_base / f"{video.filename}.mp4"
    # Also check if filename already has extension (legacy)
    if not progressive_path.exists() and video.filename.endswith(".mp4"):
        progressive_path = video_storage_base / video.filename

    is_hls = hls_manifest.exists()
    is_progressive = progressive_path.exists()

    if is_hls:
        return {
            "format": "hls",
            "manifest_url": f"/api/videos/{short_id}/hls/master.m3u8",
            "ready": True,
        }
    elif is_progressive:
        return {
            "format": "progressive",
            "stream_url": f"/api/videos/{short_id}/stream",
            "ready": True,
        }
    else:
        # Video files not found - might still be processing
        return {
            "format": "unknown",
            "ready": False,
            "processing_status": str(video.processing_status),
        }


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

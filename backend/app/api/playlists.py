"""
Playlist management API endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload
from typing import List

from app.database import get_db
from app.models.user import User
from app.models.playlist import Playlist, PlaylistVideo
from app.models.video import Video
from app.schemas.playlist import (
    PlaylistCreate,
    PlaylistUpdate,
    PlaylistVideoAdd,
    PlaylistReorderRequest,
    PlaylistResponse,
    PlaylistListResponse,
    PlaylistWithVideosResponse,
    PlaylistVideoResponse,
)
from app.api.deps import get_current_user, require_admin

router = APIRouter()


async def get_playlist_or_404(playlist_id: str, db: AsyncSession) -> Playlist:
    """Get playlist by ID or raise 404."""
    result = await db.execute(
        select(Playlist)
        .options(
            joinedload(Playlist.creator),
            selectinload(Playlist.playlist_videos).selectinload(PlaylistVideo.video),
        )
        .where(Playlist.id == playlist_id)
    )
    playlist = result.scalar_one_or_none()

    if not playlist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Playlist not found: {playlist_id}",
        )

    return playlist


async def require_playlist_owner(playlist: Playlist, current_user: User) -> None:
    """Require that the current user is the playlist owner."""
    is_owner = playlist.created_by == current_user.id

    if not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to modify this playlist",
        )


async def require_playlist_owner_or_admin(
    playlist: Playlist, current_user: User
) -> None:
    """Require that the current user is the playlist owner or an admin."""
    is_owner = playlist.created_by == current_user.id
    is_admin = current_user.role == "admin"

    if not (is_owner or is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this playlist",
        )


def build_playlist_response(
    playlist: Playlist, video_count: int, first_video_thumbnail: str | None = None
) -> PlaylistResponse:
    """Build playlist response with metadata."""
    return PlaylistResponse(
        id=playlist.id,
        name=playlist.name,
        description=playlist.description,
        created_by=playlist.created_by,
        creator_username=playlist.creator.username,
        video_count=video_count,
        created_at=playlist.created_at,
        updated_at=playlist.updated_at,
        first_video_thumbnail=first_video_thumbnail,
    )


@router.get("/by-user/{username}", response_model=PlaylistListResponse)
async def get_playlists_by_user(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get all playlists created by a specific user.
    Available to all authenticated users.
    """
    # Find user by username
    user_result = await db.execute(
        select(User).where(User.username == username.lower())
    )
    user = user_result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User not found: {username}",
        )

    # Query playlists with video counts and first video thumbnail
    query = (
        select(
            Playlist,
            func.count(PlaylistVideo.id).label("video_count"),
            func.min(Video.thumbnail_filename).label("first_thumbnail"),
        )
        .outerjoin(PlaylistVideo, Playlist.id == PlaylistVideo.playlist_id)
        .outerjoin(Video, PlaylistVideo.video_id == Video.id)
        .where(Playlist.created_by == user.id)
        .options(joinedload(Playlist.creator))
        .group_by(Playlist.id)
        .order_by(desc(Playlist.created_at))
    )

    result = await db.execute(query)
    rows = result.all()

    playlists = []
    for playlist, video_count, first_thumbnail in rows:
        playlists.append(
            build_playlist_response(playlist, video_count or 0, first_thumbnail)
        )

    return PlaylistListResponse(playlists=playlists, total=len(playlists))


@router.post("/", response_model=PlaylistResponse, status_code=status.HTTP_201_CREATED)
async def create_playlist(
    playlist_data: PlaylistCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new playlist.
    Available to all authenticated users.
    """
    # Create playlist
    playlist = Playlist(
        name=playlist_data.name,
        description=playlist_data.description,
        created_by=current_user.id,
    )

    db.add(playlist)
    await db.commit()
    await db.refresh(playlist)

    # Fetch creator relationship
    await db.refresh(playlist, ["creator"])

    return build_playlist_response(playlist, video_count=0)


@router.get("/{playlist_id}", response_model=PlaylistWithVideosResponse)
async def get_playlist(
    playlist_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get playlist details with all videos.
    Available to all authenticated users (all playlists are public).
    """
    playlist = await get_playlist_or_404(playlist_id, db)

    # Build video responses with full details
    from app.api.videos import build_video_response

    playlist_videos = []
    for pv in sorted(playlist.playlist_videos, key=lambda x: x.position):
        # Get category if exists
        category = None
        if pv.video.category_id:
            cat_result = await db.execute(
                select(Video)
                .where(Video.id == pv.video.id)
                .options(joinedload(Video.category))
            )
            video_with_cat = cat_result.scalar_one_or_none()
            if video_with_cat:
                category = video_with_cat.category

        # Get uploader
        uploader_result = await db.execute(
            select(User).where(User.id == pv.video.uploaded_by)
        )
        uploader = uploader_result.scalar_one_or_none()

        video_response = build_video_response(pv.video, uploader, category)

        playlist_videos.append(
            PlaylistVideoResponse(
                id=pv.id,
                playlist_id=pv.playlist_id,
                video_id=pv.video_id,
                position=pv.position,
                added_at=pv.added_at,
                added_by=pv.added_by,
                video=video_response,
            )
        )

    video_count = len(playlist_videos)
    first_thumbnail = (
        playlist_videos[0].video.thumbnail_filename if playlist_videos else None
    )

    return PlaylistWithVideosResponse(
        id=playlist.id,
        name=playlist.name,
        description=playlist.description,
        created_by=playlist.created_by,
        creator_username=playlist.creator.username,
        video_count=video_count,
        created_at=playlist.created_at,
        updated_at=playlist.updated_at,
        first_video_thumbnail=first_thumbnail,
        videos=playlist_videos,
    )


@router.patch("/{playlist_id}", response_model=PlaylistResponse)
async def update_playlist(
    playlist_id: str,
    playlist_data: PlaylistUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update playlist metadata (name, description).
    Only the playlist creator can update.
    """
    playlist = await get_playlist_or_404(playlist_id, db)
    await require_playlist_owner(playlist, current_user)

    # Update fields
    if playlist_data.name is not None:
        playlist.name = playlist_data.name
    if playlist_data.description is not None:
        playlist.description = playlist_data.description

    await db.commit()
    await db.refresh(playlist)

    # Get video count
    count_result = await db.execute(
        select(func.count(PlaylistVideo.id)).where(
            PlaylistVideo.playlist_id == playlist_id
        )
    )
    video_count = count_result.scalar_one()

    # Get first thumbnail
    first_thumb_result = await db.execute(
        select(Video.thumbnail_filename)
        .join(PlaylistVideo, PlaylistVideo.video_id == Video.id)
        .where(PlaylistVideo.playlist_id == playlist_id)
        .order_by(PlaylistVideo.position)
        .limit(1)
    )
    first_thumbnail = first_thumb_result.scalar_one_or_none()

    return build_playlist_response(playlist, video_count, first_thumbnail)


@router.delete("/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_playlist(
    playlist_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a playlist.
    Only the playlist creator or admin can delete.
    """
    playlist = await get_playlist_or_404(playlist_id, db)
    await require_playlist_owner_or_admin(playlist, current_user)

    await db.delete(playlist)
    await db.commit()

    return None


@router.post("/{playlist_id}/videos", response_model=PlaylistVideoResponse)
async def add_video_to_playlist(
    playlist_id: str,
    video_data: PlaylistVideoAdd,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Add a video to a playlist.
    Only the playlist creator can add videos.
    """
    playlist = await get_playlist_or_404(playlist_id, db)
    await require_playlist_owner(playlist, current_user)

    # Check if video exists
    video_result = await db.execute(
        select(Video).where(Video.id == video_data.video_id)
    )
    video = video_result.scalar_one_or_none()

    if not video:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Video not found: {video_data.video_id}",
        )

    # Check if video already in playlist
    existing_result = await db.execute(
        select(PlaylistVideo).where(
            PlaylistVideo.playlist_id == playlist_id,
            PlaylistVideo.video_id == video_data.video_id,
        )
    )
    if existing_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Video already in playlist",
        )

    # Determine position
    if video_data.position is not None:
        position = video_data.position
    else:
        # Append to end
        max_pos_result = await db.execute(
            select(func.max(PlaylistVideo.position)).where(
                PlaylistVideo.playlist_id == playlist_id
            )
        )
        max_pos = max_pos_result.scalar_one_or_none()
        position = (max_pos + 1) if max_pos is not None else 0

    # Create playlist video entry
    playlist_video = PlaylistVideo(
        playlist_id=playlist_id,
        video_id=video_data.video_id,
        position=position,
        added_by=current_user.id,
    )

    db.add(playlist_video)
    await db.commit()
    await db.refresh(playlist_video)

    # Build response
    from app.api.videos import build_video_response

    # Get video with relationships
    video_result = await db.execute(
        select(Video)
        .options(joinedload(Video.uploader), joinedload(Video.category))
        .where(Video.id == video_data.video_id)
    )
    video = video_result.scalar_one()

    video_response = build_video_response(video, video.uploader, video.category)

    return PlaylistVideoResponse(
        id=playlist_video.id,
        playlist_id=playlist_video.playlist_id,
        video_id=playlist_video.video_id,
        position=playlist_video.position,
        added_at=playlist_video.added_at,
        added_by=playlist_video.added_by,
        video=video_response,
    )


@router.delete(
    "/{playlist_id}/videos/{video_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_video_from_playlist(
    playlist_id: str,
    video_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Remove a video from a playlist.
    Only the playlist creator can remove videos.
    Reorders remaining videos to fill the gap.
    """
    playlist = await get_playlist_or_404(playlist_id, db)
    await require_playlist_owner(playlist, current_user)

    # Find the playlist video entry
    pv_result = await db.execute(
        select(PlaylistVideo).where(
            PlaylistVideo.playlist_id == playlist_id,
            PlaylistVideo.video_id == video_id,
        )
    )
    playlist_video = pv_result.scalar_one_or_none()

    if not playlist_video:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video not found in playlist",
        )

    removed_position = playlist_video.position

    # Delete the entry
    await db.delete(playlist_video)

    # Reorder remaining videos (decrease position by 1 for all videos after this one)
    remaining_result = await db.execute(
        select(PlaylistVideo)
        .where(
            PlaylistVideo.playlist_id == playlist_id,
            PlaylistVideo.position > removed_position,
        )
        .order_by(PlaylistVideo.position)
    )
    remaining_videos = remaining_result.scalars().all()

    for pv in remaining_videos:
        pv.position -= 1

    await db.commit()

    return None


@router.patch("/{playlist_id}/reorder", status_code=status.HTTP_200_OK)
async def reorder_playlist_videos(
    playlist_id: str,
    reorder_data: PlaylistReorderRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Reorder videos in a playlist.
    Only the playlist creator can reorder videos.
    """
    playlist = await get_playlist_or_404(playlist_id, db)
    await require_playlist_owner(playlist, current_user)

    # Validate and update positions
    for item in reorder_data.video_positions:
        video_id = item.get("video_id")
        position = item.get("position")

        if video_id is None or position is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Each item must have video_id and position",
            )

        # Find and update the playlist video
        pv_result = await db.execute(
            select(PlaylistVideo).where(
                PlaylistVideo.playlist_id == playlist_id,
                PlaylistVideo.video_id == video_id,
            )
        )
        playlist_video = pv_result.scalar_one_or_none()

        if not playlist_video:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Video {video_id} not found in playlist",
            )

        # Update position - type: ignore to bypass SQLAlchemy type checking
        playlist_video.position = position  # type: ignore

    await db.commit()

    return {"message": "Playlist reordered successfully"}


@router.get("/videos/{video_id}/playlists", response_model=PlaylistListResponse)
async def get_video_playlists(
    video_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get all of the current user's playlists, indicating which ones contain the specified video.
    Used for the "Add to Playlist" dialog checkbox state.
    """
    # Get user's playlists
    query = (
        select(Playlist)
        .where(Playlist.created_by == current_user.id)
        .options(joinedload(Playlist.creator))
        .order_by(desc(Playlist.created_at))
    )

    result = await db.execute(query)
    playlists = result.scalars().all()

    # For each playlist, check if it contains the video and get video count
    playlist_responses = []
    for playlist in playlists:
        # Count videos
        count_result = await db.execute(
            select(func.count(PlaylistVideo.id)).where(
                PlaylistVideo.playlist_id == playlist.id
            )
        )
        video_count = count_result.scalar_one()

        # Get first thumbnail
        first_thumb_result = await db.execute(
            select(Video.thumbnail_filename)
            .join(PlaylistVideo, PlaylistVideo.video_id == Video.id)
            .where(PlaylistVideo.playlist_id == playlist.id)
            .order_by(PlaylistVideo.position)
            .limit(1)
        )
        first_thumbnail = first_thumb_result.scalar_one_or_none()

        playlist_responses.append(
            build_playlist_response(playlist, video_count, first_thumbnail)
        )

    return PlaylistListResponse(
        playlists=playlist_responses, total=len(playlist_responses)
    )

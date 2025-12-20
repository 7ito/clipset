from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, asc
from app.api.deps import (
    get_db,
    get_current_active_user,
    require_admin,
    get_current_user,
)
from app.schemas.user import (
    UserResponse,
    UserProfile,
    UserWithQuota,
    UserDirectoryResponse,
)
from app.models.user import User
from app.models.video import Video
from app.models.playlist import Playlist

router = APIRouter()


@router.get("", response_model=list[UserResponse])
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    List all users with video and playlist counts (admin only, paginated).

    - **page**: Page number (starts at 1)
    - **page_size**: Number of users per page (max 100)
    """
    # Calculate offset
    offset = (page - 1) * page_size

    # Query users with counts
    query = (
        select(
            User,
            func.count(func.distinct(Video.id)).label("video_count"),
            func.count(func.distinct(Playlist.id)).label("playlist_count"),
        )
        .outerjoin(Video, User.id == Video.uploaded_by)
        .outerjoin(Playlist, User.id == Playlist.created_by)
        .group_by(User.id)
        .order_by(User.created_at.desc())
        .limit(page_size)
        .offset(offset)
    )

    result = await db.execute(query)
    rows = result.all()

    users = []
    for user, video_count, playlist_count in rows:
        user_resp = UserResponse.model_validate(user)
        user_resp.video_count = video_count
        user_resp.playlist_count = playlist_count
        users.append(user_resp)

    return users


@router.get("/directory", response_model=list[UserDirectoryResponse])
async def user_directory(
    search: str = Query(None),
    sort: str = Query("newest"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Public user directory (authenticated users only).
    Only shows active users.
    """
    # Base query for active users with counts
    query = (
        select(
            User,
            func.count(func.distinct(Video.id)).label("video_count"),
            func.count(func.distinct(Playlist.id)).label("playlist_count"),
        )
        .outerjoin(Video, User.id == Video.uploaded_by)
        .outerjoin(Playlist, User.id == Playlist.created_by)
        .where(User.is_active == True)
        .group_by(User.id)
    )

    # Search filter
    if search:
        query = query.where(User.username.ilike(f"%{search}%"))

    # Sorting
    if sort == "newest":
        query = query.order_by(desc(User.created_at))
    elif sort == "alphabetical":
        query = query.order_by(asc(User.username))
    elif sort == "videos":
        query = query.order_by(desc("video_count"), asc(User.username))
    elif sort == "playlists":
        query = query.order_by(desc("playlist_count"), asc(User.username))

    result = await db.execute(query)
    rows = result.all()

    users = []
    for user, video_count, playlist_count in rows:
        users.append(
            UserDirectoryResponse(
                id=user.id,
                username=user.username,
                video_count=video_count,
                playlist_count=playlist_count,
            )
        )

    return users


@router.get("/by-username/{username}", response_model=UserProfile | UserWithQuota)
async def get_user_by_username(
    username: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get user profile by username with video and playlist counts.

    - Returns UserWithQuota (including quota info) if viewing own profile
    - Returns UserProfile (public info) if viewing another user's profile
    - Username is case-insensitive
    """
    # Normalize to lowercase for case-insensitive lookup
    username_lower = username.lower()

    # Query user with counts
    query = (
        select(
            User,
            func.count(func.distinct(Video.id)).label("video_count"),
            func.count(func.distinct(Playlist.id)).label("playlist_count"),
        )
        .outerjoin(Video, User.id == Video.uploaded_by)
        .outerjoin(Playlist, User.id == Playlist.created_by)
        .where(User.username == username_lower)
        .group_by(User.id)
    )

    result = await db.execute(query)
    row = result.first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    user, video_count, playlist_count = row

    # Return full info if viewing own profile
    if user.id == current_user.id:
        resp = UserWithQuota.model_validate(user)
        resp.video_count = video_count
        resp.playlist_count = playlist_count
        return resp

    # Return public profile otherwise
    resp = UserProfile.model_validate(user)
    resp.video_count = video_count
    resp.playlist_count = playlist_count
    return resp


@router.get("/{user_id}", response_model=UserProfile | UserWithQuota)
async def get_user(
    user_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get user profile by ID with video and playlist counts.

    - Returns UserWithQuota (including quota info) if viewing own profile
    - Returns UserProfile (public info) if viewing another user's profile
    """
    # Query user with counts
    query = (
        select(
            User,
            func.count(func.distinct(Video.id)).label("video_count"),
            func.count(func.distinct(Playlist.id)).label("playlist_count"),
        )
        .outerjoin(Video, User.id == Video.uploaded_by)
        .outerjoin(Playlist, User.id == Playlist.created_by)
        .where(User.id == user_id)
        .group_by(User.id)
    )

    result = await db.execute(query)
    row = result.first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    user, video_count, playlist_count = row

    # Return full info if viewing own profile
    if user.id == current_user.id:
        resp = UserWithQuota.model_validate(user)
        resp.video_count = video_count
        resp.playlist_count = playlist_count
        return resp

    # Return public profile otherwise
    resp = UserProfile.model_validate(user)
    resp.video_count = video_count
    resp.playlist_count = playlist_count
    return resp


@router.delete("/{user_id}", status_code=status.HTTP_200_OK)
async def delete_user(
    user_id: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete (deactivate) a user (admin only).

    - Soft delete: Sets is_active to False
    - Cannot delete yourself
    """
    # Check if trying to delete self
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete yourself"
        )

    # Get user
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    # Soft delete
    user.is_active = False
    await db.commit()

    return {"message": "User deactivated successfully"}


@router.post("/{user_id}/activate", status_code=status.HTTP_200_OK)
async def activate_user(
    user_id: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Activate a user (admin only).
    """
    # Get user
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    # Activate
    user.is_active = True
    await db.commit()

    return {"message": "User activated successfully"}

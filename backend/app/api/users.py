from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, asc
from typing import Union
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
from app.services import storage

router = APIRouter()


def build_user_response(
    user: User,
    video_count: int,
    playlist_count: int,
    response_type: Union[
        type[UserResponse],
        type[UserWithQuota],
        type[UserProfile],
        type[UserDirectoryResponse],
    ] = UserResponse,
) -> Union[UserResponse, UserWithQuota, UserProfile, UserDirectoryResponse]:
    """Helper to build user response with computed avatar_url."""
    avatar_url = None
    if user.avatar_filename:
        avatar_url = f"/media/avatars/{user.avatar_filename}"

    if response_type == UserWithQuota:
        resp = UserWithQuota.model_validate(user)
    elif response_type == UserProfile:
        resp = UserProfile.model_validate(user)
    elif response_type == UserDirectoryResponse:
        return UserDirectoryResponse(
            id=user.id,
            username=user.username,
            video_count=video_count,
            playlist_count=playlist_count,
            avatar_url=avatar_url,
        )
    else:
        resp = UserResponse.model_validate(user)

    resp.video_count = video_count
    resp.playlist_count = playlist_count
    resp.avatar_url = avatar_url
    return resp


@router.get("/", response_model=list[UserResponse])
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=500),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    List all users with video and playlist counts (admin only, paginated).

    - **skip**: Number of users to skip (default 0)
    - **limit**: Maximum number of users to return (default 10, max 500)
    """
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
        .limit(limit)
        .offset(skip)
    )

    result = await db.execute(query)
    rows = result.all()

    users = []
    for user, video_count, playlist_count in rows:
        users.append(
            build_user_response(user, video_count, playlist_count, UserResponse)
        )

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
            build_user_response(
                user, video_count, playlist_count, UserDirectoryResponse
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
        return build_user_response(user, video_count, playlist_count, UserWithQuota)

    # Return public profile otherwise
    return build_user_response(user, video_count, playlist_count, UserProfile)


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
        return build_user_response(user, video_count, playlist_count, UserWithQuota)

    # Return public profile otherwise
    return build_user_response(user, video_count, playlist_count, UserProfile)


@router.post("/me/avatar", response_model=UserWithQuota)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload and process a new avatar for the current user.
    """
    # Validate file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be an image",
        )

    try:
        # Delete old avatar if exists
        if current_user.avatar_filename:
            storage.delete_user_avatar(current_user.avatar_filename)

        # Save and process new avatar
        filename, _ = storage.save_user_avatar(file, current_user.id)

        # Update user record
        current_user.avatar_filename = filename
        await db.commit()
        await db.refresh(current_user)

        # Get counts for response separately for reliability
        video_count = (
            await db.execute(
                select(func.count(Video.id)).where(Video.uploaded_by == current_user.id)
            )
        ).scalar() or 0
        playlist_count = (
            await db.execute(
                select(func.count(Playlist.id)).where(
                    Playlist.created_by == current_user.id
                )
            )
        ).scalar() or 0

        return build_user_response(
            current_user, video_count, playlist_count, UserWithQuota
        )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload avatar: {str(e)}",
        )


@router.delete("/me/avatar", response_model=UserWithQuota)
async def delete_avatar(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Remove the current user's avatar.
    """
    if not current_user.avatar_filename:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User has no avatar",
        )

    # Delete avatar file
    storage.delete_user_avatar(current_user.avatar_filename)

    # Update user record
    current_user.avatar_filename = None
    await db.commit()
    await db.refresh(current_user)

    # Get counts for response separately for reliability
    video_count = (
        await db.execute(
            select(func.count(Video.id)).where(Video.uploaded_by == current_user.id)
        )
    ).scalar() or 0
    playlist_count = (
        await db.execute(
            select(func.count(Playlist.id)).where(
                Playlist.created_by == current_user.id
            )
        )
    ).scalar() or 0

    return build_user_response(current_user, video_count, playlist_count, UserWithQuota)


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

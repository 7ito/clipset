from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.api.deps import get_db, get_current_active_user, require_admin
from app.schemas.user import UserResponse, UserProfile, UserWithQuota
from app.models.user import User

router = APIRouter()


@router.get("", response_model=list[UserResponse])
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    List all users (admin only, paginated).

    - **page**: Page number (starts at 1)
    - **page_size**: Number of users per page (max 100)
    """
    # Calculate offset
    offset = (page - 1) * page_size

    # Get users
    result = await db.execute(
        select(User).order_by(User.created_at.desc()).limit(page_size).offset(offset)
    )
    users = result.scalars().all()

    return users


@router.get("/by-username/{username}", response_model=UserProfile | UserWithQuota)
async def get_user_by_username(
    username: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get user profile by username.

    - Returns UserWithQuota (including quota info) if viewing own profile
    - Returns UserProfile (public info) if viewing another user's profile
    - Username is case-insensitive
    """
    # Normalize to lowercase for case-insensitive lookup
    username_lower = username.lower()

    # Get user by username
    result = await db.execute(select(User).where(User.username == username_lower))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    # Return full info if viewing own profile
    if user.id == current_user.id:
        return UserWithQuota.model_validate(user)

    # Return public profile otherwise
    return UserProfile.model_validate(user)


@router.get("/{user_id}", response_model=UserProfile | UserWithQuota)
async def get_user(
    user_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get user profile by ID.

    - Returns UserWithQuota (including quota info) if viewing own profile
    - Returns UserProfile (public info) if viewing another user's profile
    """
    # Get user
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    # Return full info if viewing own profile
    if user.id == current_user.id:
        return UserWithQuota.model_validate(user)

    # Return public profile otherwise
    return UserProfile.model_validate(user)


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

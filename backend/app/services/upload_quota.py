"""
Upload quota service for managing user upload limits.

Handles quota checking, incrementing, and resetting.
"""

import logging
from typing import Dict, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User
from app.services.config import get_or_create_config
from app.config import settings

logger = logging.getLogger(__name__)


async def check_user_quota(
    db: AsyncSession, user: User, file_size: int
) -> Tuple[bool, str]:
    """
    Check if user can upload a file of given size.

    Args:
        db: Database session
        user: User model instance
        file_size: Size of file to upload in bytes

    Returns:
        Tuple of (can_upload, reason)
    """
    # Get limit from DB config
    try:
        config = await get_or_create_config(db)
        limit = config.weekly_upload_limit_bytes
    except Exception as e:
        logger.warning(f"Failed to fetch DB config, using env default: {e}")
        limit = settings.WEEKLY_UPLOAD_LIMIT_BYTES

    used = user.weekly_upload_bytes

    # Calculate if upload would exceed quota
    would_use = used + file_size

    if would_use > limit:
        used_gb = used / (1024**3)
        limit_gb = limit / (1024**3)
        file_gb = file_size / (1024**3)

        reason = (
            f"Upload would exceed weekly quota. "
            f"Used: {used_gb:.2f} GB / {limit_gb:.2f} GB. "
            f"File size: {file_gb:.2f} GB"
        )
        logger.warning(f"Quota check failed for user {user.username}: {reason}")
        return False, reason

    logger.info(f"Quota check passed for user {user.username}: {used}/{limit} bytes")
    return True, ""


async def increment_user_quota(db: AsyncSession, user_id: str, file_size: int) -> None:
    """
    Increment user's weekly upload quota.

    Args:
        db: Database session
        user_id: User ID
        file_size: Size of uploaded file in bytes
    """
    try:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one()

        user.weekly_upload_bytes += file_size
        await db.commit()

        logger.info(
            f"Incremented quota for user {user.username}: "
            f"+{file_size} bytes (total: {user.weekly_upload_bytes})"
        )
    except Exception as e:
        logger.error(f"Failed to increment quota for user {user_id}: {e}")
        await db.rollback()
        raise


async def get_quota_info(db: AsyncSession, user: User) -> Dict:
    """
    Get quota information for a user.

    Args:
        db: Database session
        user: User model instance

    Returns:
        Dict with keys: used_bytes, limit_bytes, remaining_bytes, percentage_used, can_upload, max_file_size_bytes
    """
    # Get limit and max file size from DB config
    try:
        config = await get_or_create_config(db)
        limit = config.weekly_upload_limit_bytes
        max_file_size = config.max_file_size_bytes
    except Exception as e:
        logger.warning(f"Failed to fetch DB config, using env default: {e}")
        limit = settings.WEEKLY_UPLOAD_LIMIT_BYTES
        max_file_size = settings.MAX_FILE_SIZE_BYTES

    used = user.weekly_upload_bytes
    remaining = max(0, limit - used)
    percentage = (used / limit * 100) if limit > 0 else 0
    can_upload = used < limit

    return {
        "used_bytes": used,
        "limit_bytes": limit,
        "remaining_bytes": remaining,
        "percentage_used": round(percentage, 2),
        "can_upload": can_upload,
        "max_file_size_bytes": max_file_size,
    }


async def reset_user_quota(db: AsyncSession, user_id: str) -> None:
    """
    Reset a single user's weekly upload quota to zero.

    Args:
        db: Database session
        user_id: User ID
    """
    try:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one()

        user.weekly_upload_bytes = 0
        await db.commit()

        logger.info(f"Reset quota for user {user.username}")
    except Exception as e:
        logger.error(f"Failed to reset quota for user {user_id}: {e}")
        await db.rollback()
        raise


async def reset_all_quotas(db: AsyncSession) -> int:
    """
    Reset all users' weekly upload quotas to zero.

    This is called by admin action (manual for MVP).

    Args:
        db: Database session

    Returns:
        Number of users reset
    """
    try:
        result = await db.execute(select(User))
        users = result.scalars().all()

        count = 0
        for user in users:
            user.weekly_upload_bytes = 0
            count += 1

        await db.commit()

        logger.info(f"Reset quotas for {count} users")
        return count
    except Exception as e:
        logger.error(f"Failed to reset all quotas: {e}")
        await db.rollback()
        raise

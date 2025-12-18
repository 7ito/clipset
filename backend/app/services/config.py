"""
Config service for managing application configuration.

Handles the singleton Config model.
"""

import logging
from typing import Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.config import Config
from app.config import settings

logger = logging.getLogger(__name__)


async def get_or_create_config(db: AsyncSession) -> Config:
    """
    Get the singleton Config record, creating it with defaults if it doesn't exist.

    Args:
        db: Database session

    Returns:
        Config model instance
    """
    try:
        # Try to fetch existing config (id=1)
        result = await db.execute(select(Config).where(Config.id == 1))
        config = result.scalar_one_or_none()

        if config:
            logger.info("Config fetched from database")
            return config

        # Create default config
        config = Config(
            id=1,
            max_file_size_bytes=settings.MAX_FILE_SIZE_BYTES,
            weekly_upload_limit_bytes=settings.WEEKLY_UPLOAD_LIMIT_BYTES,
            video_storage_path=settings.VIDEO_STORAGE_PATH,
        )

        db.add(config)
        await db.commit()
        await db.refresh(config)

        logger.info("Created default config")
        return config

    except Exception as e:
        logger.error(f"Failed to get or create config: {e}")
        await db.rollback()
        raise


async def update_config(
    db: AsyncSession, updates: Dict[str, Any], updated_by_id: Optional[str] = None
) -> Config:
    """
    Update configuration values.

    Args:
        db: Database session
        updates: Dict of field names and new values
        updated_by_id: ID of user making the update (optional)

    Returns:
        Updated Config model instance
    """
    try:
        config = await get_or_create_config(db)

        # Update fields
        for field, value in updates.items():
            if hasattr(config, field):
                setattr(config, field, value)
                logger.info(f"Updated config.{field} = {value}")
            else:
                logger.warning(
                    f"Attempted to update non-existent config field: {field}"
                )

        # Track who made the update
        if updated_by_id:
            config.updated_by = updated_by_id

        await db.commit()
        await db.refresh(config)

        logger.info("Config updated successfully")
        return config

    except Exception as e:
        logger.error(f"Failed to update config: {e}")
        await db.rollback()
        raise


async def get_setting(db: AsyncSession, key: str) -> Any:
    """
    Get a single configuration setting value.

    Args:
        db: Database session
        key: Setting name (e.g., "max_file_size_bytes")

    Returns:
        Setting value, or None if not found
    """
    try:
        config = await get_or_create_config(db)

        if hasattr(config, key):
            return getattr(config, key)
        else:
            logger.warning(f"Requested non-existent config setting: {key}")
            return None

    except Exception as e:
        logger.error(f"Failed to get config setting {key}: {e}")
        raise

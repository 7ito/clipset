"""
Config service for managing application configuration.

Handles the singleton Config model and transcoding presets.
"""

import logging
from typing import Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.config import Config
from app.config import settings

logger = logging.getLogger(__name__)


# Transcoding preset definitions
TRANSCODING_PRESETS = {
    "quality": {
        "nvenc_preset": "p6",
        "nvenc_cq": 16,
        "nvenc_max_bitrate": "15M",
        "nvenc_buffer_size": "30M",
        "cpu_preset": "slow",
        "cpu_crf": 16,
        "max_resolution": "4k",
        "audio_bitrate": "256k",
    },
    "balanced": {
        "nvenc_preset": "p4",
        "nvenc_cq": 18,
        "nvenc_max_bitrate": "8M",
        "nvenc_buffer_size": "16M",
        "cpu_preset": "medium",
        "cpu_crf": 18,
        "max_resolution": "1080p",
        "audio_bitrate": "192k",
    },
    "performance": {
        "nvenc_preset": "p2",
        "nvenc_cq": 23,
        "nvenc_max_bitrate": "5M",
        "nvenc_buffer_size": "10M",
        "cpu_preset": "fast",
        "cpu_crf": 23,
        "max_resolution": "1080p",
        "audio_bitrate": "128k",
    },
}

# Resolution to dimensions mapping
RESOLUTION_MAP = {
    "720p": (1280, 720),
    "1080p": (1920, 1080),
    "1440p": (2560, 1440),
    "4k": (3840, 2160),
}


def get_preset_values(preset_mode: str) -> Dict[str, Any]:
    """
    Get transcoding values for a preset mode.

    Args:
        preset_mode: One of 'quality', 'balanced', 'performance'

    Returns:
        Dict of transcoding settings for the preset, or empty dict for 'custom'
    """
    return TRANSCODING_PRESETS.get(preset_mode, {})


def get_resolution_dimensions(resolution: str) -> tuple[int, int]:
    """
    Convert resolution string to width/height dimensions.

    Args:
        resolution: Resolution string (e.g., '1080p', '4k')

    Returns:
        Tuple of (width, height)
    """
    return RESOLUTION_MAP.get(resolution, (1920, 1080))


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
            logger.debug("Config fetched from database")
            return config

        # Create default config with values from env settings where applicable
        config = Config(
            id=1,
            # Upload & Storage (from env or defaults)
            max_file_size_bytes=settings.MAX_FILE_SIZE_BYTES,
            weekly_upload_limit_bytes=settings.WEEKLY_UPLOAD_LIMIT_BYTES,
            video_storage_path=settings.VIDEO_STORAGE_PATH,
            # GPU Settings
            use_gpu_transcoding=False,
            gpu_device_id=0,
            # NVENC Settings (balanced preset defaults)
            nvenc_preset="p4",
            nvenc_cq=18,
            nvenc_rate_control="vbr",
            nvenc_max_bitrate="8M",
            nvenc_buffer_size="16M",
            # CPU Settings (recommended defaults)
            cpu_preset="medium",
            cpu_crf=18,
            # Output Settings
            max_resolution="1080p",
            audio_bitrate="192k",
            # Preset Mode
            transcode_preset_mode="balanced",
            # Video Output Format
            video_output_format="hls",
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

    If preset mode is changed to a non-custom preset, automatically applies
    the preset values.

    Args:
        db: Database session
        updates: Dict of field names and new values
        updated_by_id: ID of user making the update (optional)

    Returns:
        Updated Config model instance
    """
    try:
        config = await get_or_create_config(db)

        # Check if preset mode is being changed to a non-custom preset
        new_preset_mode = updates.get("transcode_preset_mode")
        if new_preset_mode and new_preset_mode != "custom":
            # Apply preset values (they can be overridden by explicit updates)
            preset_values = get_preset_values(new_preset_mode)
            for field, value in preset_values.items():
                if field not in updates:  # Don't override explicit updates
                    setattr(config, field, value)
                    logger.info(f"Applied preset value config.{field} = {value}")

        # Update fields from the request
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


def get_transcoding_config_dict(config: Config) -> Dict[str, Any]:
    """
    Extract transcoding-related settings from Config into a dict.

    Useful for passing to video processor functions.

    Args:
        config: Config model instance

    Returns:
        Dict with transcoding settings
    """
    width, height = get_resolution_dimensions(config.max_resolution)

    return {
        "use_gpu_transcoding": config.use_gpu_transcoding,
        "gpu_device_id": config.gpu_device_id,
        "nvenc_preset": config.nvenc_preset,
        "nvenc_cq": config.nvenc_cq,
        "nvenc_rate_control": config.nvenc_rate_control,
        "nvenc_max_bitrate": config.nvenc_max_bitrate,
        "nvenc_buffer_size": config.nvenc_buffer_size,
        "cpu_preset": config.cpu_preset,
        "cpu_crf": config.cpu_crf,
        "max_width": width,
        "max_height": height,
        "audio_bitrate": config.audio_bitrate,
        "video_output_format": config.video_output_format,
    }

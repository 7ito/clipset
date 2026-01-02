"""
Config API endpoints for system configuration management.
"""

import logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user, require_admin
from app.models.user import User
from app.schemas.config import ConfigResponse, ConfigUpdate, EncoderInfo
from app.services.config import get_or_create_config, update_config
from app.services.video_processor import detect_encoders
from app.services.background_tasks import get_migration_status

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/", response_model=ConfigResponse)
async def get_system_config(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Get current system configuration.

    **Admin only**

    Returns all system settings including upload limits, storage paths,
    and transcoding settings.
    """
    try:
        config = await get_or_create_config(db)
        return config
    except Exception as e:
        logger.error(f"Failed to fetch config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch system configuration",
        )


@router.get("/encoders", response_model=EncoderInfo)
async def get_available_encoders(
    current_user: User = Depends(require_admin),
):
    """
    Detect available video encoders.

    **Admin only**

    Returns information about available GPU and CPU encoders.
    Useful for determining if GPU transcoding is available.
    """
    try:
        encoder_info = await detect_encoders()
        return encoder_info
    except Exception as e:
        logger.error(f"Failed to detect encoders: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to detect available encoders",
        )


@router.patch("/", response_model=ConfigResponse)
async def update_system_config(
    updates: ConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Update system configuration.

    **Admin only**

    Updates one or more system settings. All fields are optional - only provided
    fields will be updated.

    **Validation Rules:**
    - `max_file_size_bytes`: 1MB - 10GB
    - `weekly_upload_limit_bytes`: 1MB - 100GB
    - `video_storage_path`: Valid path string (1-500 characters)
    - `nvenc_preset`: p1 - p7
    - `nvenc_cq`: 0 - 51
    - `nvenc_rate_control`: vbr, cbr, or constqp
    - `cpu_preset`: ultrafast to veryslow
    - `cpu_crf`: 0 - 51
    - `max_resolution`: 720p, 1080p, 1440p, or 4k
    - `transcode_preset_mode`: quality, balanced, performance, or custom

    **Note:** Changes to storage paths will affect new uploads only. Existing
    videos will remain in their current locations. Transcoding setting changes
    only affect new uploads.
    """
    try:
        # Convert Pydantic model to dict, excluding unset fields
        update_data = updates.model_dump(exclude_unset=True)

        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields provided for update",
            )

        # Validate storage path if provided
        if "video_storage_path" in update_data:
            path = Path(update_data["video_storage_path"])
            try:
                # Try to create if doesn't exist
                path.mkdir(parents=True, exist_ok=True)
                # Test write permission
                test_file = path / f".write_test_{current_user.id}"
                test_file.touch()
                test_file.unlink()
                logger.info(f"Validated writable storage path: {path}")
            except Exception as e:
                logger.error(f"Invalid storage path '{path}': {e}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid or unwritable storage path: {str(e)}",
                )

        # Update config with user tracking
        config = await update_config(db, update_data, str(current_user.id))

        logger.info(
            f"Config updated by {current_user.username}: {list(update_data.keys())}"
        )

        return config

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update system configuration",
        )


@router.get("/hls-migration-status")
async def get_hls_migration_status(
    current_user: User = Depends(require_admin),
):
    """
    Get the status of HLS migration for existing videos.

    **Admin only**

    Returns information about the HLS migration process including:
    - Whether migration is currently running
    - Total videos to migrate
    - Number of videos completed
    - Current video being processed
    - Any errors that occurred
    """
    return get_migration_status()

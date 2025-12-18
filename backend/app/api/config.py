"""
Config API endpoints for system configuration management.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user, require_admin
from app.models.user import User
from app.schemas.config import ConfigResponse, ConfigUpdate
from app.services.config import get_or_create_config, update_config

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

    Returns all system settings including upload limits and storage paths.
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

    **Note:** Changes to storage paths will affect new uploads only. Existing
    videos will remain in their current locations.
    """
    try:
        # Convert Pydantic model to dict, excluding unset fields
        update_data = updates.model_dump(exclude_unset=True)

        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields provided for update",
            )

        # Update config with user tracking
        config = await update_config(db, update_data, current_user.id)

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

"""
Background tasks service for asynchronous video processing.

Handles the complete video processing pipeline in the background.
"""

import logging
from pathlib import Path

from app.database import async_session_maker
from app.models.video import Video, ProcessingStatus
from app.services import storage, video_processor
from app.config import settings
from sqlalchemy import select

logger = logging.getLogger(__name__)


async def process_video_task(video_id: str) -> None:
    """
    Background task for processing an uploaded video.

    Processing steps:
    1. Update status to PROCESSING
    2. Validate video file
    3. Extract metadata
    4. Transcode if needed (or copy if already compatible)
    5. Generate thumbnail
    6. Update Video record with results (COMPLETED or FAILED)
    7. Cleanup temp file

    Args:
        video_id: ID of the Video record to process
    """
    async with async_session_maker() as db:
        try:
            # Fetch video record
            result = await db.execute(select(Video).where(Video.id == video_id))
            video = result.scalar_one_or_none()

            if not video:
                logger.error(f"Video not found for processing: {video_id}")
                return

            logger.info(
                f"Starting background processing for video {video_id}: {video.title}"
            )

            # Update status to PROCESSING
            video.processing_status = ProcessingStatus.PROCESSING
            await db.commit()

            # Define file paths
            temp_path = Path(settings.TEMP_STORAGE_PATH) / video.filename
            video_output_path = Path(settings.VIDEO_STORAGE_PATH) / video.filename
            thumbnail_filename = video.filename.rsplit(".", 1)[0] + ".jpg"
            thumbnail_output_path = (
                Path(settings.THUMBNAIL_STORAGE_PATH) / thumbnail_filename
            )

            # Check if temp file exists
            if not temp_path.exists():
                raise FileNotFoundError(f"Temp file not found: {temp_path}")

            # Process the video
            result = video_processor.process_video_file(
                input_path=temp_path,
                output_path=video_output_path,
                thumbnail_path=thumbnail_output_path,
            )

            if not result["success"]:
                # Processing failed
                error_msg = result.get("error", "Unknown error")
                video.processing_status = ProcessingStatus.FAILED
                video.error_message = error_msg[:500]  # Truncate to 500 chars
                logger.error(f"Video processing failed for {video_id}: {error_msg}")
            else:
                # Processing succeeded
                video.processing_status = ProcessingStatus.COMPLETED
                video.duration_seconds = result.get("duration")
                video.thumbnail_filename = (
                    thumbnail_filename if thumbnail_output_path.exists() else None
                )
                logger.info(f"Video processing completed for {video_id}")

            await db.commit()

        except Exception as e:
            # Unexpected error during processing
            logger.error(
                f"Unexpected error processing video {video_id}: {e}", exc_info=True
            )

            try:
                # Try to update video status to FAILED
                result = await db.execute(select(Video).where(Video.id == video_id))
                video = result.scalar_one_or_none()

                if video:
                    video.processing_status = ProcessingStatus.FAILED
                    video.error_message = f"Processing error: {str(e)}"[:500]
                    await db.commit()
            except Exception as update_error:
                logger.error(
                    f"Failed to update video status after error: {update_error}"
                )

        finally:
            # Always cleanup temp file
            try:
                temp_path = (
                    Path(settings.TEMP_STORAGE_PATH) / video.filename
                    if "video" in locals()
                    else None
                )
                if temp_path and temp_path.exists():
                    storage.delete_file(temp_path)
                    logger.info(f"Cleaned up temp file: {temp_path}")
            except Exception as cleanup_error:
                logger.error(f"Failed to cleanup temp file: {cleanup_error}")

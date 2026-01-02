"""
Background tasks service for asynchronous video processing.

Handles complete video processing pipeline in background.
"""

import asyncio
import logging
from pathlib import Path
from typing import Optional

from app.database import async_session_maker
from app.models.video import Video, ProcessingStatus
from app.services import storage, video_processor
from app.services.config import get_or_create_config, get_transcoding_config_dict
from app.config import settings
from sqlalchemy import select

logger = logging.getLogger(__name__)

# Global migration state
_migration_state = {
    "is_running": False,
    "total": 0,
    "completed": 0,
    "current_video": None,
    "errors": [],
}


async def process_video_task(video_id: str) -> None:
    """
    Background task for processing an uploaded video.

    Processing steps:
    1. Update status to PROCESSING
    2. Fetch transcoding config from database
    3. Validate video file
    4. Extract metadata
    5. Transcode if needed (or copy if already compatible)
    6. Generate thumbnail
    7. Update Video record with results (COMPLETED or FAILED)
    8. Cleanup temp file

    Args:
        video_id: ID of Video record to process
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

            # Fetch transcoding config from database
            try:
                config = await get_or_create_config(db)
                transcode_config = get_transcoding_config_dict(config)
                logger.info(
                    f"Loaded transcoding config: GPU={transcode_config['use_gpu_transcoding']}, "
                    f"max_res={transcode_config['max_width']}x{transcode_config['max_height']}"
                )
            except Exception as e:
                logger.warning(
                    f"Failed to load transcoding config, using defaults: {e}"
                )
                transcode_config = None

            # Define file paths
            temp_path = Path(settings.TEMP_STORAGE_PATH) / video.filename

            # Use dynamic storage path from video record
            video_storage_base = Path(video.storage_path or settings.VIDEO_STORAGE_PATH)
            # Ensure it exists
            video_storage_base.mkdir(parents=True, exist_ok=True)

            # Normalize output filename to .mp4
            output_filename = storage.normalize_video_extension(video.filename)
            video_output_path = video_storage_base / output_filename
            thumbnail_filename = Path(output_filename).stem + ".jpg"
            thumbnail_output_path = (
                Path(settings.THUMBNAIL_STORAGE_PATH) / thumbnail_filename
            )

            # Check if temp file exists
            if not temp_path.exists():
                raise FileNotFoundError(f"Temp file not found: {temp_path}")

            # Determine output format from config
            video_output_format = "hls"  # Default
            if transcode_config:
                video_output_format = transcode_config.get("video_output_format", "hls")

            logger.info(f"Processing video with output format: {video_output_format}")

            # Process video with transcoding config
            result = await video_processor.process_video_file(
                input_path=temp_path,
                output_path=video_output_path,
                thumbnail_path=thumbnail_output_path,
                transcode_config=transcode_config,
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

                actual_output_format = result.get("output_format", "progressive")

                # Update filename based on output format
                if actual_output_format == "hls":
                    # For HLS, store the directory name (stem without extension)
                    hls_dir_name = Path(output_filename).stem
                    if video.filename != hls_dir_name:
                        logger.info(
                            f"Updated filename from {video.filename} to {hls_dir_name} (HLS)"
                        )
                        video.filename = hls_dir_name

                    # Calculate total size of all HLS files
                    hls_dir = video_storage_base / hls_dir_name
                    if hls_dir.exists():
                        total_size = sum(
                            f.stat().st_size for f in hls_dir.iterdir() if f.is_file()
                        )
                        video.file_size_bytes = total_size
                        logger.info(
                            f"Updated file_size_bytes for {video_id}: "
                            f"{total_size} bytes (HLS total)"
                        )
                    else:
                        logger.warning(
                            f"HLS directory not found at {hls_dir}, "
                            f"keeping original file_size_bytes"
                        )
                else:
                    # Progressive - single MP4 file
                    if video.filename != output_filename:
                        logger.info(
                            f"Updated filename from {video.filename} to {output_filename}"
                        )
                        video.filename = output_filename

                    if video_output_path.exists():
                        transcoded_size = video_output_path.stat().st_size
                        video.file_size_bytes = transcoded_size
                        logger.info(
                            f"Updated file_size_bytes for {video_id}: "
                            f"{transcoded_size} bytes (transcoded from original upload size)"
                        )
                    else:
                        logger.warning(
                            f"Transcoded file not found at {video_output_path}, "
                            f"keeping original file_size_bytes"
                        )

                logger.info(
                    f"Video processing completed for {video_id} (format={actual_output_format})"
                )

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


def get_migration_status() -> dict:
    """Get the current HLS migration status."""
    return _migration_state.copy()


async def migrate_video_to_hls(video_id: str) -> bool:
    """
    Convert a single video from progressive MP4 to HLS format.

    Args:
        video_id: ID of the video to migrate

    Returns:
        True if successful, False otherwise
    """
    async with async_session_maker() as db:
        try:
            result = await db.execute(select(Video).where(Video.id == video_id))
            video = result.scalar_one_or_none()

            if not video:
                logger.error(f"Video not found for HLS migration: {video_id}")
                return False

            if video.processing_status != ProcessingStatus.COMPLETED:
                logger.warning(
                    f"Skipping HLS migration for {video_id}: "
                    f"status is {video.processing_status}"
                )
                return False

            video_storage_base = Path(video.storage_path or settings.VIDEO_STORAGE_PATH)

            # Get the base filename without extension for HLS directory
            # video.filename might be "uuid.mp4" or "uuid_timestamp.mp4" or just "uuid"
            video_filename = video.filename
            hls_dir_name = Path(video_filename).stem  # Remove extension if present

            # Check if already has HLS
            hls_dir = video_storage_base / hls_dir_name
            hls_manifest = hls_dir / "master.m3u8"
            if hls_manifest.exists():
                logger.info(f"Video {video_id} already has HLS, skipping")
                return True

            # Find the source video file
            # Try with the full filename first, then add .mp4 if needed
            source_path = video_storage_base / video_filename
            if not source_path.exists() or source_path.is_dir():
                source_path = video_storage_base / f"{video_filename}.mp4"
            if not source_path.exists():
                # Try with stem + .mp4
                source_path = video_storage_base / f"{hls_dir_name}.mp4"
            if not source_path.exists():
                logger.error(
                    f"Source video file not found for HLS migration: {video_id}"
                )
                return False

            logger.info(f"Starting HLS migration for video {video_id}: {source_path}")

            # Get transcoding config
            try:
                config = await get_or_create_config(db)
                transcode_config = get_transcoding_config_dict(config)
            except Exception as e:
                logger.warning(f"Using default config for migration: {e}")
                transcode_config = {"video_output_format": "hls"}

            # Create HLS output directory (use stem without extension)
            hls_output_dir = video_storage_base / hls_dir_name
            hls_output_dir.mkdir(parents=True, exist_ok=True)

            # Transcode to HLS
            success, error_msg = await video_processor.transcode_video_hls(
                input_path=source_path,
                output_dir=hls_output_dir,
                transcode_config=transcode_config,
            )

            if not success:
                logger.error(f"HLS migration failed for {video_id}: {error_msg}")
                # Clean up partial HLS directory
                storage.delete_hls_directory(video_storage_base, hls_dir_name)
                return False

            # Update video record with HLS directory name (without .mp4 extension)
            # This allows stream-info endpoint to find the HLS manifest
            if video.filename != hls_dir_name:
                logger.info(
                    f"Updating video filename from {video.filename} to {hls_dir_name}"
                )
                video.filename = hls_dir_name

            # Calculate total size of HLS files
            total_size = sum(
                f.stat().st_size for f in hls_output_dir.iterdir() if f.is_file()
            )
            video.file_size_bytes = total_size

            await db.commit()

            logger.info(
                f"HLS migration completed for {video_id}: "
                f"{total_size} bytes in HLS format"
            )

            # Optionally delete the original MP4 file to save space
            # Uncomment if you want to remove originals after successful conversion
            # storage.delete_file(source_path)

            return True

        except Exception as e:
            logger.error(f"Error during HLS migration of {video_id}: {e}")
            return False


async def migrate_all_videos_to_hls() -> None:
    """
    Background task to migrate all completed videos to HLS format.

    This runs on server startup when HLS is enabled and there are
    videos that haven't been converted yet.
    """
    global _migration_state

    if _migration_state["is_running"]:
        logger.warning("HLS migration is already running, skipping")
        return

    _migration_state["is_running"] = True
    _migration_state["errors"] = []

    try:
        async with async_session_maker() as db:
            # Check if HLS is enabled in config
            try:
                config = await get_or_create_config(db)
                if config.video_output_format != "hls":
                    logger.info("HLS is not enabled, skipping migration")
                    return
            except Exception as e:
                logger.warning(
                    f"Could not check config, proceeding with migration: {e}"
                )

            # Find all completed videos that need HLS conversion
            result = await db.execute(
                select(Video).where(
                    Video.processing_status == ProcessingStatus.COMPLETED
                )
            )
            videos = result.scalars().all()

            # Filter to only videos without HLS
            videos_to_migrate = []
            for video in videos:
                video_storage_base = Path(
                    video.storage_path or settings.VIDEO_STORAGE_PATH
                )
                # Get base filename without extension for HLS directory
                hls_dir_name = Path(video.filename).stem
                hls_manifest = video_storage_base / hls_dir_name / "master.m3u8"
                if not hls_manifest.exists():
                    videos_to_migrate.append(video)

            if not videos_to_migrate:
                logger.info("No videos need HLS migration")
                return

            _migration_state["total"] = len(videos_to_migrate)
            _migration_state["completed"] = 0

            logger.info(f"Starting HLS migration for {len(videos_to_migrate)} videos")

            for video in videos_to_migrate:
                _migration_state["current_video"] = video.title or video.id

                try:
                    success = await migrate_video_to_hls(video.id)
                    if success:
                        _migration_state["completed"] += 1
                    else:
                        _migration_state["errors"].append(
                            f"Failed to migrate: {video.id}"
                        )
                except Exception as e:
                    logger.error(f"Error migrating video {video.id}: {e}")
                    _migration_state["errors"].append(f"Error: {video.id} - {str(e)}")

                # Small delay between videos to avoid overwhelming the system
                await asyncio.sleep(1)

            logger.info(
                f"HLS migration completed: {_migration_state['completed']}/{_migration_state['total']} "
                f"videos converted, {len(_migration_state['errors'])} errors"
            )

    except Exception as e:
        logger.error(f"HLS migration task failed: {e}")
    finally:
        _migration_state["is_running"] = False
        _migration_state["current_video"] = None

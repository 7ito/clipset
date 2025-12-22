"""
Storage service for file operations.

Handles all file system operations for videos, thumbnails, and temporary files.
"""

import os
import shutil
import uuid
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import BinaryIO
import logging

from fastapi import UploadFile
from app.config import settings

logger = logging.getLogger(__name__)


def ensure_directories() -> None:
    """
    Create storage directories if they don't exist.

    Creates:
    - VIDEO_STORAGE_PATH
    - THUMBNAIL_STORAGE_PATH
    - TEMP_STORAGE_PATH
    - CATEGORY_IMAGE_STORAGE_PATH
    """
    directories = [
        settings.VIDEO_STORAGE_PATH,
        settings.THUMBNAIL_STORAGE_PATH,
        settings.TEMP_STORAGE_PATH,
        settings.CHUNKS_STORAGE_PATH,
        settings.CATEGORY_IMAGE_STORAGE_PATH,
        settings.AVATAR_STORAGE_PATH,
    ]

    for directory in directories:
        path = Path(directory)
        path.mkdir(parents=True, exist_ok=True)
        logger.info(f"Ensured directory exists: {path}")


def save_uploaded_file(upload_file: UploadFile, destination_path: Path) -> int:
    """
    Save an uploaded file to disk by streaming chunks.

    Args:
        upload_file: FastAPI UploadFile object
        destination_path: Path where file should be saved

    Returns:
        Number of bytes written

    Raises:
        IOError: If file cannot be written
    """
    try:
        bytes_written = 0
        with open(destination_path, "wb") as f:
            while chunk := upload_file.file.read(8192):  # 8KB chunks
                f.write(chunk)
                bytes_written += len(chunk)

        logger.info(
            f"Saved uploaded file to {destination_path} ({bytes_written} bytes)"
        )
        return bytes_written
    except Exception as e:
        logger.error(f"Failed to save uploaded file to {destination_path}: {e}")
        # Cleanup partial file if it exists
        if destination_path.exists():
            destination_path.unlink()
        raise IOError(f"Failed to save uploaded file: {e}")


def move_file(source: Path, destination: Path) -> None:
    """
    Move a file from source to destination atomically.

    Args:
        source: Source file path
        destination: Destination file path

    Raises:
        IOError: If file cannot be moved
    """
    try:
        # Ensure destination directory exists
        destination.parent.mkdir(parents=True, exist_ok=True)

        # Use shutil.move for atomic operation
        shutil.move(str(source), str(destination))
        logger.info(f"Moved file from {source} to {destination}")
    except Exception as e:
        logger.error(f"Failed to move file from {source} to {destination}: {e}")
        raise IOError(f"Failed to move file: {e}")


def delete_file(filepath: Path) -> bool:
    """
    Delete a file from disk.

    Args:
        filepath: Path to file to delete

    Returns:
        True if file was deleted, False if it didn't exist
    """
    try:
        if filepath.exists():
            filepath.unlink()
            logger.info(f"Deleted file: {filepath}")
            return True
        else:
            logger.warning(f"File doesn't exist, cannot delete: {filepath}")
            return False
    except Exception as e:
        logger.error(f"Failed to delete file {filepath}: {e}")
        return False


def get_file_size(filepath: Path) -> int:
    """
    Get file size in bytes.

    Args:
        filepath: Path to file

    Returns:
        File size in bytes

    Raises:
        FileNotFoundError: If file doesn't exist
    """
    if not filepath.exists():
        raise FileNotFoundError(f"File not found: {filepath}")

    return filepath.stat().st_size


def generate_unique_filename(original_filename: str) -> str:
    """
    Generate a unique filename using UUID and timestamp.

    Format: {uuid}_{timestamp}.{extension}
    Example: 550e8400-e29b-41d4-a716-446655440000_20240115123045.mp4

    Args:
        original_filename: Original filename with extension

    Returns:
        Unique filename string
    """
    # Extract extension
    ext = Path(original_filename).suffix.lower()  # .mp4, .mov, etc.
    if not ext:
        ext = ".mp4"  # Default to .mp4 if no extension

    # Generate unique components
    unique_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")

    # Combine: uuid_timestamp.ext
    filename = f"{unique_id}_{timestamp}{ext}"

    return filename


def cleanup_temp_files(older_than_hours: int = 24) -> int:
    """
    Remove temporary files older than specified hours.

    Args:
        older_than_hours: Delete files older than this many hours (default: 24)

    Returns:
        Number of files deleted
    """
    temp_path = Path(settings.TEMP_STORAGE_PATH)

    if not temp_path.exists():
        logger.warning(f"Temp directory doesn't exist: {temp_path}")
        return 0

    cutoff_time = datetime.now(timezone.utc) - timedelta(hours=older_than_hours)
    deleted_count = 0

    try:
        for file in temp_path.iterdir():
            if file.is_file():
                # file.stat().st_mtime is a float (seconds since epoch)
                # datetime.fromtimestamp returns a local datetime unless a timezone is provided
                file_modified_time = datetime.fromtimestamp(
                    file.stat().st_mtime, tz=timezone.utc
                )

                if file_modified_time < cutoff_time:
                    try:
                        file.unlink()
                        deleted_count += 1
                        logger.info(f"Cleaned up old temp file: {file}")
                    except Exception as e:
                        logger.error(f"Failed to delete temp file {file}: {e}")

        if deleted_count > 0:
            logger.info(
                f"Cleaned up {deleted_count} temp files older than {older_than_hours} hours"
            )

        return deleted_count
    except Exception as e:
        logger.error(f"Failed to cleanup temp files: {e}")
        return deleted_count


# Category Image Functions


def save_category_image(upload_file: UploadFile, category_id: str) -> tuple[str, int]:
    """
    Save and process a category image.

    Uploads are saved to temp, processed with image_processor, then moved to final location.

    Args:
        upload_file: Uploaded image file
        category_id: Category ID (used for filename)

    Returns:
        Tuple of (filename, file_size_bytes)

    Raises:
        ValueError: If image is invalid or too large
        IOError: If file operations fail
    """
    from app.services.image_processor import (
        validate_image_file,
        resize_and_convert_image,
    )

    # Generate filename: {category_id}.webp
    filename = f"{category_id}.webp"

    # Save to temp first
    temp_dir = Path(settings.TEMP_STORAGE_PATH)
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_path = temp_dir / f"temp_{filename}_{uuid.uuid4()}.tmp"

    try:
        # Save uploaded file to temp
        save_uploaded_file(upload_file, temp_path)

        # Validate image
        validate_image_file(temp_path, settings.MAX_CATEGORY_IMAGE_SIZE_BYTES)

        # Process and convert to WebP
        final_path = Path(settings.CATEGORY_IMAGE_STORAGE_PATH) / filename
        final_path.parent.mkdir(parents=True, exist_ok=True)

        file_size = resize_and_convert_image(
            temp_path, final_path, size=settings.CATEGORY_IMAGE_SIZE, quality=85
        )

        # Clean up temp file
        temp_path.unlink()

        logger.info(f"Saved category image: {filename} ({file_size} bytes)")
        return filename, file_size

    except Exception as e:
        # Clean up temp file on error
        if temp_path.exists():
            temp_path.unlink()
        raise


def delete_category_image(image_filename: str) -> bool:
    """
    Delete a category image from storage.

    Args:
        image_filename: Name of the image file to delete

    Returns:
        True if deleted, False if file didn't exist
    """
    image_path = Path(settings.CATEGORY_IMAGE_STORAGE_PATH) / image_filename
    return delete_file(image_path)


def get_category_image_path(image_filename: str) -> Path:
    """
    Get the full path to a category image file.

    Args:
        image_filename: Name of the image file

    Returns:
        Path object to the image file
    """
    return Path(settings.CATEGORY_IMAGE_STORAGE_PATH) / image_filename


# User Avatar Functions


def save_user_avatar(upload_file: UploadFile, user_id: str) -> tuple[str, int]:
    """
    Save and process a user avatar.

    Uploads are saved to temp, processed with image_processor, then moved to final location.

    Args:
        upload_file: Uploaded image file
        user_id: User ID (used for filename)

    Returns:
        Tuple of (filename, file_size_bytes)

    Raises:
        ValueError: If image is invalid or too large
        IOError: If file operations fail
    """
    from app.services.image_processor import (
        validate_image_file,
        resize_and_convert_image,
    )

    # Generate filename: {user_id}_{uuid}.webp (using uuid to avoid caching issues)
    unique_suffix = str(uuid.uuid4())[:8]
    filename = f"{user_id}_{unique_suffix}.webp"

    # Save to temp first
    temp_dir = Path(settings.TEMP_STORAGE_PATH)
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_path = temp_dir / f"temp_{filename}_{uuid.uuid4()}.tmp"

    try:
        # Save uploaded file to temp
        save_uploaded_file(upload_file, temp_path)

        # Validate image
        validate_image_file(temp_path, settings.MAX_AVATAR_SIZE_BYTES)

        # Process and convert to WebP
        final_path = Path(settings.AVATAR_STORAGE_PATH) / filename
        final_path.parent.mkdir(parents=True, exist_ok=True)

        file_size = resize_and_convert_image(
            temp_path, final_path, size=settings.AVATAR_IMAGE_SIZE, quality=85
        )

        # Clean up temp file
        temp_path.unlink()

        logger.info(f"Saved user avatar: {filename} ({file_size} bytes)")
        return filename, file_size

    except Exception as e:
        # Clean up temp file on error
        if temp_path.exists():
            temp_path.unlink()
        raise


def delete_user_avatar(avatar_filename: str) -> bool:
    """
    Delete a user avatar from storage.

    Args:
        avatar_filename: Name of the avatar file to delete

    Returns:
        True if deleted, False if file didn't exist
    """
    avatar_path = Path(settings.AVATAR_STORAGE_PATH) / avatar_filename
    return delete_file(avatar_path)


def get_user_avatar_path(avatar_filename: str) -> Path:
    """
    Get the full path to a user avatar file.

    Args:
        avatar_filename: Name of the avatar file

    Returns:
        Path object to the avatar file
    """
    return Path(settings.AVATAR_STORAGE_PATH) / avatar_filename

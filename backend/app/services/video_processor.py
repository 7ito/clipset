"""
Video processor service using FFmpeg.

Handles video validation, transcoding, thumbnail extraction, and metadata extraction.
All subprocess calls are async to prevent blocking the FastAPI event loop.
"""

import asyncio
import json
import logging
from pathlib import Path
from typing import Dict, Tuple, Optional

from app.config import settings

logger = logging.getLogger(__name__)


async def validate_video_file(filepath: Path) -> Tuple[bool, str]:
    """
    Validate that a file is a valid video using ffprobe.

    Args:
        filepath: Path to video file

    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        process = await asyncio.create_subprocess_exec(
            settings.FFMPEG_PATH.replace("ffmpeg", "ffprobe"),
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=codec_type",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(filepath),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await asyncio.wait_for(
            process.communicate(), timeout=30
        )

        if process.returncode != 0:
            error_msg = stderr.decode().strip() or "Invalid video file"
            logger.error(f"Video validation failed for {filepath}: {error_msg}")
            return False, error_msg

        # Check if it's a video stream
        if "video" not in stdout.decode().lower():
            logger.error(f"File {filepath} is not a video file")
            return False, "File is not a valid video"

        logger.info(f"Video file validated successfully: {filepath}")
        return True, ""

    except asyncio.TimeoutError:
        logger.error(f"Video validation timed out for {filepath}")
        return False, "Video validation timed out"
    except Exception as e:
        logger.error(f"Error validating video {filepath}: {e}")
        return False, f"Validation error: {str(e)}"


async def get_video_metadata(filepath: Path) -> Dict:
    """
    Extract video metadata using ffprobe.

    Args:
        filepath: Path to video file

    Returns:
        Dict with keys: duration, width, height, codec_name
    """
    try:
        process = await asyncio.create_subprocess_exec(
            settings.FFMPEG_PATH.replace("ffmpeg", "ffprobe"),
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=width,height,codec_name",
            "-of",
            "json",
            str(filepath),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await asyncio.wait_for(
            process.communicate(), timeout=30
        )

        if process.returncode != 0:
            logger.error(f"Failed to extract metadata from {filepath}: {stderr.decode()}")
            return {}

        data = json.loads(stdout.decode())

        # Extract duration from format
        duration = None
        if "format" in data and "duration" in data["format"]:
            try:
                duration = int(float(data["format"]["duration"]))
            except (ValueError, TypeError):
                pass

        # Extract video stream info
        width = None
        height = None
        codec_name = None

        if "streams" in data and len(data["streams"]) > 0:
            stream = data["streams"][0]
            width = stream.get("width")
            height = stream.get("height")
            codec_name = stream.get("codec_name")

        metadata = {
            "duration": duration,
            "width": width,
            "height": height,
            "codec_name": codec_name,
        }

        logger.info(f"Extracted metadata from {filepath}: {metadata}")
        return metadata

    except asyncio.TimeoutError:
        logger.error(f"Metadata extraction timed out for {filepath}")
        return {}
    except Exception as e:
        logger.error(f"Error extracting metadata from {filepath}: {e}")
        return {}


async def needs_transcoding(filepath: Path) -> bool:
    """
    Check if video needs transcoding for web compatibility.

    A video needs transcoding if it's NOT H.264 MP4.

    Args:
        filepath: Path to video file

    Returns:
        True if transcoding is needed, False otherwise
    """
    try:
        # Check codec
        process = await asyncio.create_subprocess_exec(
            settings.FFMPEG_PATH.replace("ffmpeg", "ffprobe"),
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=codec_name",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(filepath),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await asyncio.wait_for(
            process.communicate(), timeout=30
        )

        if process.returncode != 0:
            logger.warning(f"Could not determine codec for {filepath}, will transcode")
            return True

        codec = stdout.decode().strip().lower()

        # Check for pixel format (8-bit vs 10-bit)
        pix_fmt_process = await asyncio.create_subprocess_exec(
            settings.FFMPEG_PATH.replace("ffmpeg", "ffprobe"),
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=pix_fmt",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(filepath),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        pix_fmt_stdout, _ = await asyncio.wait_for(
            pix_fmt_process.communicate(), timeout=30
        )

        pix_fmt = pix_fmt_stdout.decode().strip().lower()
        is_8bit = pix_fmt and "10" not in pix_fmt and "12" not in pix_fmt

        # Check if it's H.264 (h264, libx264, avc, etc.)
        is_h264 = codec in ["h264", "libx264", "avc"]

        # Check file extension
        is_mp4 = filepath.suffix.lower() == ".mp4"

        needs_transcode = not (is_h264 and is_mp4 and is_8bit)

        logger.info(
            f"Video {filepath} - codec: {codec}, pix_fmt: {pix_fmt}, is_mp4: {is_mp4}, needs_transcoding: {needs_transcode}"
        )
        return needs_transcode

    except asyncio.TimeoutError:
        logger.error(f"Transcoding check timed out for {filepath}")
        return True  # Default to transcoding if we can't determine
    except Exception as e:
        logger.error(f"Error checking if transcoding needed for {filepath}: {e}")
        return True  # Default to transcoding if we can't determine


async def transcode_video(input_path: Path, output_path: Path) -> Tuple[bool, str]:
    """
    Transcode video to 1080p H.264 MP4 optimized for web streaming.

    Args:
        input_path: Path to input video
        output_path: Path to save transcoded video

    Returns:
        Tuple of (success, error_message)
    """
    try:
        # FFmpeg command for web-optimized transcoding
        cmd = [
            settings.FFMPEG_PATH,
            "-i",
            str(input_path),
            "-vf",
            "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",  # Ensure 8-bit compatibility for 10-bit sources
            "-preset",
            "medium",
            "-crf",
            "23",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",  # Optimize for web streaming
            "-y",  # Overwrite output file
            str(output_path),
        ]

        logger.info(f"Transcoding video: {input_path} -> {output_path}")

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await asyncio.wait_for(
            process.communicate(),
            timeout=settings.VIDEO_PROCESSING_TIMEOUT,
        )

        if process.returncode != 0:
            error_msg = stderr.decode()[-500:] if stderr else "Unknown error"
            logger.error(f"Transcoding failed for {input_path}: {error_msg}")
            return False, f"Transcoding failed: {error_msg}"

        logger.info(f"Successfully transcoded video: {output_path}")
        return True, ""

    except asyncio.TimeoutError:
        logger.error(
            f"Transcoding timed out for {input_path} (timeout: {settings.VIDEO_PROCESSING_TIMEOUT}s)"
        )
        return (
            False,
            f"Transcoding timed out after {settings.VIDEO_PROCESSING_TIMEOUT} seconds",
        )
    except Exception as e:
        logger.error(f"Error transcoding video {input_path}: {e}")
        return False, f"Transcoding error: {str(e)}"


async def extract_thumbnail(
    video_path: Path, thumbnail_path: Path, timestamp: float = 1.0
) -> bool:
    """
    Extract a thumbnail from video at specified timestamp.

    Args:
        video_path: Path to video file
        thumbnail_path: Path to save thumbnail
        timestamp: Timestamp in seconds to extract frame (default: 1.0)

    Returns:
        True if successful, False otherwise
    """
    try:
        # Ensure thumbnail directory exists
        thumbnail_path.parent.mkdir(parents=True, exist_ok=True)

        cmd = [
            settings.FFMPEG_PATH,
            "-ss",
            f"{timestamp:.2f}",
            "-i",
            str(video_path),
            "-vframes",
            "1",
            "-vf",
            "scale=640:-1",  # 640px width, maintain aspect ratio
            "-q:v",
            "2",  # High quality
            "-y",  # Overwrite output file
            str(thumbnail_path),
        ]

        logger.info(f"Extracting thumbnail from {video_path} at {timestamp}s")

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await asyncio.wait_for(
            process.communicate(), timeout=30
        )

        if process.returncode != 0:
            logger.error(f"Thumbnail extraction failed: {stderr.decode()}")
            return False

        logger.info(f"Successfully extracted thumbnail: {thumbnail_path}")
        return True

    except asyncio.TimeoutError:
        logger.error(f"Thumbnail extraction timed out for {video_path}")
        return False
    except Exception as e:
        logger.error(f"Error extracting thumbnail from {video_path}: {e}")
        return False


async def process_video_file(
    input_path: Path, output_path: Path, thumbnail_path: Path
) -> Dict:
    """
    Complete video processing pipeline.

    Steps:
    1. Validate video file
    2. Extract metadata
    3. Transcode if needed (or copy if already compatible)
    4. Extract thumbnail

    Args:
        input_path: Path to uploaded video
        output_path: Path to save processed video
        thumbnail_path: Path to save thumbnail

    Returns:
        Dict with keys: success, error, duration, width, height, codec
    """
    result = {
        "success": False,
        "error": None,
        "duration": None,
        "width": None,
        "height": None,
        "codec": None,
    }

    # Step 1: Validate
    is_valid, error_msg = await validate_video_file(input_path)
    if not is_valid:
        result["error"] = error_msg
        return result

    # Step 2: Extract metadata
    metadata = await get_video_metadata(input_path)
    result["duration"] = metadata.get("duration")
    result["width"] = metadata.get("width")
    result["height"] = metadata.get("height")
    result["codec"] = metadata.get("codec_name")

    # Step 3: Transcode if needed
    if await needs_transcoding(input_path):
        success, error_msg = await transcode_video(input_path, output_path)
        if not success:
            result["error"] = error_msg
            return result
    else:
        # Copy file if already compatible
        try:
            import shutil

            shutil.copy2(str(input_path), str(output_path))
            logger.info(
                f"Video already compatible, copied: {input_path} -> {output_path}"
            )
        except Exception as e:
            result["error"] = f"Failed to copy video: {str(e)}"
            return result

    # Step 4: Extract thumbnail
    thumbnail_success = await extract_thumbnail(output_path, thumbnail_path, timestamp=1.0)
    if not thumbnail_success:
        logger.warning(f"Thumbnail extraction failed, but continuing (non-critical)")
        # Don't fail entire process if thumbnail fails

    # Success!
    result["success"] = True
    logger.info(f"Video processing completed successfully: {output_path}")
    return result

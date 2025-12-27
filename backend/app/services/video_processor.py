"""
Video processor service using FFmpeg.

Handles video validation, transcoding, thumbnail extraction, and metadata extraction.
All subprocess calls are async to prevent blocking the FastAPI event loop.
Supports GPU acceleration via NVIDIA NVENC for faster transcoding.
"""

import asyncio
import json
import logging
from pathlib import Path
from typing import Dict, Tuple

from app.config import settings

logger = logging.getLogger(__name__)


def _get_transcode_command(
    input_path: Path, output_path: Path, use_gpu: bool = True
) -> list:
    """
    Build FFmpeg command for transcoding.

    Args:
        input_path: Path to input video
        output_path: Path to save transcoded video
        use_gpu: If True, try GPU encoding first

    Returns:
        List of FFmpeg command arguments
    """
    if use_gpu and settings.USE_GPU_TRANSCODING:
        logger.info(
            f"Using GPU transcoding: h264_nvenc "
            f"(preset={settings.NVENC_PRESET}, cq={settings.NVENC_CQ}, "
            f"rc={settings.NVENC_RATE_CONTROL}, maxrate={settings.NVENC_MAX_BITRATE}, "
            f"bufsize={settings.NVENC_BUFFER_SIZE}, audio=192k)"
        )
        return [
            settings.FFMPEG_PATH,
            "-i",
            str(input_path),
            "-vf",
            "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease",
            "-c:v",
            "h264_nvenc",
            "-pix_fmt",
            "yuv420p",
            "-preset",
            settings.NVENC_PRESET,
            "-rc",
            settings.NVENC_RATE_CONTROL,
            "-cq",
            str(settings.NVENC_CQ),
            "-b:v",
            "0",
            "-maxrate",
            settings.NVENC_MAX_BITRATE,
            "-bufsize",
            settings.NVENC_BUFFER_SIZE,
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            "-y",
            str(output_path),
        ]
    else:
        logger.info("Using CPU transcoding: libx264 (preset=medium, crf=18, audio=192k)")
        return [
            settings.FFMPEG_PATH,
            "-i",
            str(input_path),
            "-vf",
            "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            "-y",
            str(output_path),
        ]


async def _transcode_cpu_fallback(
    input_path: Path, output_path: Path
) -> Tuple[bool, str]:
    """
    Fallback CPU transcoding.

    Args:
        input_path: Path to input video
        output_path: Path to save transcoded video

    Returns:
        Tuple of (success, error_message)
    """
    cmd = _get_transcode_command(input_path, output_path, use_gpu=False)

    logger.info(f"Transcoding with CPU (fallback): {input_path} -> {output_path}")

    process = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )

    stdout, stderr = await asyncio.wait_for(
        process.communicate(), timeout=settings.VIDEO_PROCESSING_TIMEOUT
    )

    if process.returncode != 0:
        error_msg = stderr.decode()[-500:] if stderr else "Unknown error"
        logger.error(f"CPU transcoding failed: {error_msg}")
        return False, f"CPU transcoding failed: {error_msg}"

    logger.info(f"CPU transcoding succeeded: {output_path}")
    return True, ""


async def validate_video_file(filepath: Path) -> Tuple[bool, str]:
    """
    Validate that a file is a valid video using ffprobe.

    Args:
        filepath: Path to video file

    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        cmd = [
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
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )

        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=30)

        if process.returncode != 0:
            error_msg = stderr.decode().strip() or "Invalid video file"
            logger.error(f"Video validation failed for {filepath}: {error_msg}")
            return False, error_msg

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
        cmd = [
            settings.FFMPEG_PATH.replace("ffmpeg", "ffprobe"),
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=width,height,codec_name",
            "-of",
            "json",
            str(filepath),
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )

        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=30)

        if process.returncode != 0:
            logger.error(f"Failed to extract metadata from {filepath}: {stderr.decode()}")
            return {}

        data = json.loads(stdout.decode())

        duration = None
        if "format" in data and "duration" in data["format"]:
            try:
                duration = int(float(data["format"]["duration"]))
            except (ValueError, TypeError):
                pass

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
            "codec": codec_name,
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
        cmd = [
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
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )

        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=30)

        if process.returncode != 0:
            logger.warning(
                f"Could not determine codec for {filepath}, will transcode"
            )
            return True

        codec = stdout.decode().strip().lower()

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

        is_h264 = codec in ["h264", "libx264", "avc"]
        is_mp4 = filepath.suffix.lower() == ".mp4"

        needs_transcode = not (is_h264 and is_mp4 and is_8bit)

        logger.info(
            f"Video {filepath} - codec: {codec}, pix_fmt: {pix_fmt}, "
            f"is_mp4: {is_mp4}, needs_transcoding: {needs_transcode}"
        )
        return needs_transcode

    except asyncio.TimeoutError:
        logger.error(f"Transcoding check timed out for {filepath}")
        return True
    except Exception as e:
        logger.error(f"Error checking if transcoding needed for {filepath}: {e}")
        return True


async def transcode_video(input_path: Path, output_path: Path) -> Tuple[bool, str]:
    """
    Transcode video to 1080p H.264 MP4 optimized for web streaming.

    Tries GPU first, falls back to CPU on failure.

    Args:
        input_path: Path to input video
        output_path: Path to save transcoded video

    Returns:
        Tuple of (success, error_message)
    """
    try:
        if settings.USE_GPU_TRANSCODING:
            cmd = _get_transcode_command(input_path, output_path, use_gpu=True)

            logger.info(f"Transcoding with GPU: {input_path} -> {output_path}")

            process = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await asyncio.wait_for(
                process.communicate(), timeout=settings.VIDEO_PROCESSING_TIMEOUT
            )

            if process.returncode == 0:
                logger.info(f"GPU transcoding succeeded: {output_path}")
                return True, ""
            else:
                error_msg = stderr.decode()[-500:] if stderr else "Unknown error"
                logger.warning(
                    f"GPU transcoding failed with exit code {process.returncode}, "
                    f"falling back to CPU: {error_msg}"
                )
                return await _transcode_cpu_fallback(input_path, output_path)

        else:
            return await _transcode_cpu_fallback(input_path, output_path)

    except asyncio.TimeoutError:
        logger.error(
            f"Transcoding timed out after {settings.VIDEO_PROCESSING_TIMEOUT}s, "
            f"falling back to CPU"
        )
        return await _transcode_cpu_fallback(input_path, output_path)

    except Exception as e:
        if settings.USE_GPU_TRANSCODING and (
            "nvenc" in str(e).lower() or "cuda" in str(e).lower()
        ):
            logger.error(
                f"GPU transcoding failed with CUDA/NVENC error, "
                f"falling back to CPU: {e}"
            )
            return await _transcode_cpu_fallback(input_path, output_path)
        else:
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
        thumbnail_path.parent.mkdir(parents=True, exist_ok=True)

        base_cmd = [
            settings.FFMPEG_PATH,
            "-ss",
            f"{timestamp:.2f}",
            "-i",
            str(video_path),
            "-vframes",
            "1",
            "-vf",
            "scale=640:-1",
            "-q:v",
            "2",
            "-y",
            str(thumbnail_path),
        ]

        logger.info(f"Extracting thumbnail: {video_path}")

        process = await asyncio.create_subprocess_exec(
            *base_cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )

        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=30)

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

    is_valid, error_msg = await validate_video_file(input_path)
    if not is_valid:
        result["error"] = error_msg
        return result

    metadata = await get_video_metadata(input_path)
    result["duration"] = metadata.get("duration")
    result["width"] = metadata.get("width")
    result["height"] = metadata.get("height")
    result["codec"] = metadata.get("codec_name")

    if await needs_transcoding(input_path):
        success, error_msg = await transcode_video(input_path, output_path)
        if not success:
            result["error"] = error_msg
            return result
    else:
        try:
            import shutil

            shutil.copy2(str(input_path), str(output_path))
            logger.info(
                f"Video already compatible, copied: {input_path} -> {output_path}"
            )
        except Exception as e:
            result["error"] = f"Failed to copy video: {str(e)}"
            return result

    thumbnail_success = await extract_thumbnail(
        output_path, thumbnail_path, timestamp=1.0
    )
    if not thumbnail_success:
        logger.warning(
            f"Thumbnail extraction failed, but continuing (non-critical)"
        )

    result["success"] = True
    logger.info(f"Video processing completed successfully: {output_path}")
    return result

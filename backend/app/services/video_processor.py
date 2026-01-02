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
from typing import Dict, Tuple, Optional, Any

from app.config import settings

logger = logging.getLogger(__name__)


async def detect_encoders() -> Dict[str, Any]:
    """
    Detect available video encoders on the system.

    Returns:
        Dict with keys: gpu_available, gpu_name, encoders
    """
    result = {
        "gpu_available": False,
        "gpu_name": None,
        "encoders": [],
    }

    try:
        # Get list of encoders from FFmpeg
        cmd = [settings.FFMPEG_PATH, "-encoders", "-hide_banner"]
        process = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await asyncio.wait_for(process.communicate(), timeout=10)

        if process.returncode == 0:
            output = stdout.decode()
            # Parse encoders we care about
            encoder_names = [
                "h264_nvenc",
                "hevc_nvenc",
                "av1_nvenc",
                "libx264",
                "libx265",
            ]
            for encoder in encoder_names:
                if encoder in output:
                    result["encoders"].append(encoder)

            # Check if any NVENC encoder is available
            if any("nvenc" in e for e in result["encoders"]):
                result["gpu_available"] = True

    except Exception as e:
        logger.warning(f"Failed to detect FFmpeg encoders: {e}")

    # Try to get GPU name using nvidia-smi
    if result["gpu_available"]:
        try:
            cmd = ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"]
            process = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await asyncio.wait_for(process.communicate(), timeout=5)

            if process.returncode == 0:
                gpu_name = stdout.decode().strip().split("\n")[0]  # First GPU
                result["gpu_name"] = gpu_name
                logger.info(f"Detected GPU: {gpu_name}")

        except Exception as e:
            logger.debug(f"Could not get GPU name from nvidia-smi: {e}")

    logger.info(f"Encoder detection result: {result}")
    return result


def _get_transcode_command(
    input_path: Path,
    output_path: Path,
    transcode_config: Optional[Dict[str, Any]] = None,
    use_gpu: bool = True,
    color_info: Optional[Dict[str, Optional[str]]] = None,
) -> list:
    """
    Build FFmpeg command for transcoding.

    Args:
        input_path: Path to input video
        output_path: Path to save transcoded video
        transcode_config: Dict of transcoding settings from database
        use_gpu: If True, try GPU encoding first
        color_info: Dict with color metadata (color_range, color_space, etc.)

    Returns:
        List of FFmpeg command arguments
    """
    # Use provided config or fall back to env settings
    if transcode_config:
        use_gpu_transcoding = transcode_config.get("use_gpu_transcoding", False)
        max_width = transcode_config.get("max_width", 1920)
        max_height = transcode_config.get("max_height", 1080)
        audio_bitrate = transcode_config.get("audio_bitrate", "192k")
    else:
        use_gpu_transcoding = settings.USE_GPU_TRANSCODING
        max_width = 1920
        max_height = 1080
        audio_bitrate = "192k"

    # Determine if input video uses full color range
    # "pc" = full range (0-255), "tv" = limited range (16-235)
    # yuvj* pixel formats are implicitly full range
    is_full_range = False
    if color_info:
        input_color_range = color_info.get("color_range")
        input_pix_fmt = color_info.get("pix_fmt") or ""

        if input_color_range == "pc" or input_pix_fmt.startswith("yuvj"):
            is_full_range = True

        logger.info(
            f"Color info detected - range: {input_color_range}, "
            f"pix_fmt: {input_pix_fmt}, is_full_range: {is_full_range}"
        )

    # Set output pixel format based on input color range
    # Use yuvj420p for full range to preserve colors
    output_pix_fmt = "yuvj420p" if is_full_range else "yuv420p"
    output_color_range = "pc" if is_full_range else "tv"

    # Build scale filter with explicit color range output
    if is_full_range:
        scale_filter = (
            f"scale='min({max_width},iw)':'min({max_height},ih)':"
            f"force_original_aspect_ratio=decrease:out_range=full"
        )
    else:
        scale_filter = (
            f"scale='min({max_width},iw)':'min({max_height},ih)':"
            f"force_original_aspect_ratio=decrease"
        )

    # Build color metadata flags (only if explicitly set in source)
    color_flags: list[str] = ["-color_range", output_color_range]
    if color_info:
        color_space = color_info.get("color_space")
        color_transfer = color_info.get("color_transfer")
        color_primaries = color_info.get("color_primaries")
        if color_space is not None:
            color_flags.append("-colorspace")
            color_flags.append(color_space)
        if color_transfer is not None:
            color_flags.append("-color_trc")
            color_flags.append(color_transfer)
        if color_primaries is not None:
            color_flags.append("-color_primaries")
            color_flags.append(color_primaries)

    if use_gpu and use_gpu_transcoding:
        # Get NVENC settings from config or env
        if transcode_config:
            nvenc_preset = transcode_config.get("nvenc_preset", "p4")
            nvenc_cq = transcode_config.get("nvenc_cq", 18)
            nvenc_rate_control = transcode_config.get("nvenc_rate_control", "vbr")
            nvenc_max_bitrate = transcode_config.get("nvenc_max_bitrate", "8M")
            nvenc_buffer_size = transcode_config.get("nvenc_buffer_size", "16M")
        else:
            nvenc_preset = settings.NVENC_PRESET
            nvenc_cq = settings.NVENC_CQ
            nvenc_rate_control = settings.NVENC_RATE_CONTROL
            nvenc_max_bitrate = settings.NVENC_MAX_BITRATE
            nvenc_buffer_size = settings.NVENC_BUFFER_SIZE

        logger.info(
            f"Using GPU transcoding: h264_nvenc "
            f"(preset={nvenc_preset}, cq={nvenc_cq}, "
            f"rc={nvenc_rate_control}, maxrate={nvenc_max_bitrate}, "
            f"bufsize={nvenc_buffer_size}, audio={audio_bitrate}, "
            f"max_res={max_width}x{max_height}, "
            f"color_range={output_color_range}, pix_fmt={output_pix_fmt})"
        )
        cmd = [
            settings.FFMPEG_PATH,
            "-i",
            str(input_path),
            "-vf",
            scale_filter,
            "-c:v",
            "h264_nvenc",
            "-pix_fmt",
            output_pix_fmt,
            "-preset",
            nvenc_preset,
            "-rc",
            nvenc_rate_control,
            "-cq",
            str(nvenc_cq),
            "-b:v",
            "0",
            "-maxrate",
            nvenc_max_bitrate,
            "-bufsize",
            nvenc_buffer_size,
        ]
        cmd.extend(color_flags)
        cmd.extend(
            [
                "-c:a",
                "aac",
                "-b:a",
                audio_bitrate,
                "-movflags",
                "+faststart",
                "-y",
                str(output_path),
            ]
        )
        return cmd
    else:
        # Get CPU settings from config or use defaults
        if transcode_config:
            cpu_preset = transcode_config.get("cpu_preset", "medium")
            cpu_crf = transcode_config.get("cpu_crf", 18)
        else:
            cpu_preset = "medium"
            cpu_crf = 18

        logger.info(
            f"Using CPU transcoding: libx264 "
            f"(preset={cpu_preset}, crf={cpu_crf}, audio={audio_bitrate}, "
            f"max_res={max_width}x{max_height}, "
            f"color_range={output_color_range}, pix_fmt={output_pix_fmt})"
        )
        cmd = [
            settings.FFMPEG_PATH,
            "-i",
            str(input_path),
            "-vf",
            scale_filter,
            "-c:v",
            "libx264",
            "-pix_fmt",
            output_pix_fmt,
            "-preset",
            cpu_preset,
            "-crf",
            str(cpu_crf),
        ]
        cmd.extend(color_flags)
        cmd.extend(
            [
                "-c:a",
                "aac",
                "-b:a",
                audio_bitrate,
                "-movflags",
                "+faststart",
                "-y",
                str(output_path),
            ]
        )
        return cmd


async def _transcode_cpu_fallback(
    input_path: Path,
    output_path: Path,
    transcode_config: Optional[Dict[str, Any]] = None,
    color_info: Optional[Dict[str, Optional[str]]] = None,
) -> Tuple[bool, str]:
    """
    Fallback CPU transcoding.

    Args:
        input_path: Path to input video
        output_path: Path to save transcoded video
        transcode_config: Dict of transcoding settings from database
        color_info: Dict with color metadata (color_range, color_space, etc.)

    Returns:
        Tuple of (success, error_message)
    """
    cmd = _get_transcode_command(
        input_path, output_path, transcode_config, use_gpu=False, color_info=color_info
    )

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
        Dict with keys: duration, width, height, codec_name, and color info
        (color_range, color_space, color_transfer, color_primaries, pix_fmt)
    """
    try:
        cmd = [
            settings.FFMPEG_PATH.replace("ffmpeg", "ffprobe"),
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=width,height,codec_name,color_range,color_space,color_transfer,color_primaries,pix_fmt",
            "-of",
            "json",
            str(filepath),
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )

        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=30)

        if process.returncode != 0:
            logger.error(
                f"Failed to extract metadata from {filepath}: {stderr.decode()}"
            )
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
        color_range = None
        color_space = None
        color_transfer = None
        color_primaries = None
        pix_fmt = None

        if "streams" in data and len(data["streams"]) > 0:
            stream = data["streams"][0]
            width = stream.get("width")
            height = stream.get("height")
            codec_name = stream.get("codec_name")
            color_range = stream.get("color_range")
            color_space = stream.get("color_space")
            color_transfer = stream.get("color_transfer")
            color_primaries = stream.get("color_primaries")
            pix_fmt = stream.get("pix_fmt")

        metadata = {
            "duration": duration,
            "width": width,
            "height": height,
            "codec": codec_name,
            "color_range": color_range,
            "color_space": color_space,
            "color_transfer": color_transfer,
            "color_primaries": color_primaries,
            "pix_fmt": pix_fmt,
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
            logger.warning(f"Could not determine codec for {filepath}, will transcode")
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


async def transcode_video(
    input_path: Path,
    output_path: Path,
    transcode_config: Optional[Dict[str, Any]] = None,
    color_info: Optional[Dict[str, Optional[str]]] = None,
) -> Tuple[bool, str]:
    """
    Transcode video to H.264 MP4 optimized for web streaming.

    Tries GPU first if enabled, falls back to CPU on failure.

    Args:
        input_path: Path to input video
        output_path: Path to save transcoded video
        transcode_config: Dict of transcoding settings from database
        color_info: Dict with color metadata (color_range, color_space, etc.)

    Returns:
        Tuple of (success, error_message)
    """
    try:
        # Determine if GPU should be used
        use_gpu = False
        if transcode_config:
            use_gpu = transcode_config.get("use_gpu_transcoding", False)
        else:
            use_gpu = settings.USE_GPU_TRANSCODING

        if use_gpu:
            cmd = _get_transcode_command(
                input_path,
                output_path,
                transcode_config,
                use_gpu=True,
                color_info=color_info,
            )

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
                return await _transcode_cpu_fallback(
                    input_path, output_path, transcode_config, color_info=color_info
                )

        else:
            return await _transcode_cpu_fallback(
                input_path, output_path, transcode_config, color_info=color_info
            )

    except asyncio.TimeoutError:
        logger.error(
            f"Transcoding timed out after {settings.VIDEO_PROCESSING_TIMEOUT}s, "
            f"falling back to CPU"
        )
        return await _transcode_cpu_fallback(
            input_path, output_path, transcode_config, color_info=color_info
        )

    except Exception as e:
        use_gpu = False
        if transcode_config:
            use_gpu = transcode_config.get("use_gpu_transcoding", False)
        else:
            use_gpu = settings.USE_GPU_TRANSCODING

        if use_gpu and ("nvenc" in str(e).lower() or "cuda" in str(e).lower()):
            logger.error(
                f"GPU transcoding failed with CUDA/NVENC error, "
                f"falling back to CPU: {e}"
            )
            return await _transcode_cpu_fallback(
                input_path, output_path, transcode_config, color_info=color_info
            )
        else:
            logger.error(f"Error transcoding video {input_path}: {e}")
            return False, f"Transcoding error: {str(e)}"


def _get_hls_transcode_command(
    input_path: Path,
    output_dir: Path,
    transcode_config: Optional[Dict[str, Any]] = None,
    use_gpu: bool = True,
    color_info: Optional[Dict[str, Optional[str]]] = None,
) -> list:
    """
    Build FFmpeg command for HLS transcoding.

    Args:
        input_path: Path to input video
        output_dir: Directory to save HLS files (manifest + segments)
        transcode_config: Dict of transcoding settings from database
        use_gpu: If True, try GPU encoding
        color_info: Dict with color metadata

    Returns:
        List of FFmpeg command arguments
    """
    # Use provided config or fall back to env settings
    if transcode_config:
        use_gpu_transcoding = transcode_config.get("use_gpu_transcoding", False)
        max_width = transcode_config.get("max_width", 1920)
        max_height = transcode_config.get("max_height", 1080)
        audio_bitrate = transcode_config.get("audio_bitrate", "192k")
    else:
        use_gpu_transcoding = settings.USE_GPU_TRANSCODING
        max_width = 1920
        max_height = 1080
        audio_bitrate = "192k"

    # Determine color handling (same as progressive)
    is_full_range = False
    if color_info:
        input_color_range = color_info.get("color_range")
        input_pix_fmt = color_info.get("pix_fmt") or ""
        if input_color_range == "pc" or input_pix_fmt.startswith("yuvj"):
            is_full_range = True

    output_pix_fmt = "yuvj420p" if is_full_range else "yuv420p"
    output_color_range = "pc" if is_full_range else "tv"

    if is_full_range:
        scale_filter = (
            f"scale='min({max_width},iw)':'min({max_height},ih)':"
            f"force_original_aspect_ratio=decrease:out_range=full"
        )
    else:
        scale_filter = (
            f"scale='min({max_width},iw)':'min({max_height},ih)':"
            f"force_original_aspect_ratio=decrease"
        )

    color_flags: list[str] = ["-color_range", output_color_range]
    if color_info:
        color_space = color_info.get("color_space")
        color_transfer = color_info.get("color_transfer")
        color_primaries = color_info.get("color_primaries")
        if color_space is not None:
            color_flags.extend(["-colorspace", str(color_space)])
        if color_transfer is not None:
            color_flags.extend(["-color_trc", str(color_transfer)])
        if color_primaries is not None:
            color_flags.extend(["-color_primaries", str(color_primaries)])

    # HLS-specific settings
    hls_time = 4  # 4-second segments for good seeking granularity
    manifest_path = output_dir / "master.m3u8"
    segment_pattern = output_dir / "segment%03d.ts"

    if use_gpu and use_gpu_transcoding:
        # Get NVENC settings
        if transcode_config:
            nvenc_preset = transcode_config.get("nvenc_preset", "p4")
            nvenc_cq = transcode_config.get("nvenc_cq", 18)
            nvenc_rate_control = transcode_config.get("nvenc_rate_control", "vbr")
            nvenc_max_bitrate = transcode_config.get("nvenc_max_bitrate", "8M")
            nvenc_buffer_size = transcode_config.get("nvenc_buffer_size", "16M")
        else:
            nvenc_preset = settings.NVENC_PRESET
            nvenc_cq = settings.NVENC_CQ
            nvenc_rate_control = settings.NVENC_RATE_CONTROL
            nvenc_max_bitrate = settings.NVENC_MAX_BITRATE
            nvenc_buffer_size = settings.NVENC_BUFFER_SIZE

        logger.info(
            f"Building GPU HLS command: h264_nvenc "
            f"(preset={nvenc_preset}, cq={nvenc_cq}, hls_time={hls_time})"
        )

        cmd = [
            settings.FFMPEG_PATH,
            "-i",
            str(input_path),
            "-vf",
            scale_filter,
            "-c:v",
            "h264_nvenc",
            "-pix_fmt",
            output_pix_fmt,
            "-preset",
            nvenc_preset,
            "-rc",
            nvenc_rate_control,
            "-cq",
            str(nvenc_cq),
            "-b:v",
            "0",
            "-maxrate",
            nvenc_max_bitrate,
            "-bufsize",
            nvenc_buffer_size,
        ]
        cmd.extend(color_flags)
        cmd.extend(
            [
                "-c:a",
                "aac",
                "-b:a",
                audio_bitrate,
                # HLS output settings
                "-f",
                "hls",
                "-hls_time",
                str(hls_time),
                "-hls_list_size",
                "0",  # Keep all segments in playlist
                "-hls_segment_type",
                "mpegts",
                "-hls_segment_filename",
                str(segment_pattern),
                "-y",
                str(manifest_path),
            ]
        )
        return cmd
    else:
        # CPU encoding with libx264
        if transcode_config:
            cpu_preset = transcode_config.get("cpu_preset", "medium")
            cpu_crf = transcode_config.get("cpu_crf", 18)
        else:
            cpu_preset = "medium"
            cpu_crf = 18

        logger.info(
            f"Building CPU HLS command: libx264 "
            f"(preset={cpu_preset}, crf={cpu_crf}, hls_time={hls_time})"
        )

        cmd = [
            settings.FFMPEG_PATH,
            "-i",
            str(input_path),
            "-vf",
            scale_filter,
            "-c:v",
            "libx264",
            "-pix_fmt",
            output_pix_fmt,
            "-preset",
            cpu_preset,
            "-crf",
            str(cpu_crf),
        ]
        cmd.extend(color_flags)
        cmd.extend(
            [
                "-c:a",
                "aac",
                "-b:a",
                audio_bitrate,
                # HLS output settings
                "-f",
                "hls",
                "-hls_time",
                str(hls_time),
                "-hls_list_size",
                "0",
                "-hls_segment_type",
                "mpegts",
                "-hls_segment_filename",
                str(segment_pattern),
                "-y",
                str(manifest_path),
            ]
        )
        return cmd


async def _transcode_hls_cpu_fallback(
    input_path: Path,
    output_dir: Path,
    transcode_config: Optional[Dict[str, Any]] = None,
    color_info: Optional[Dict[str, Optional[str]]] = None,
) -> Tuple[bool, str]:
    """
    Fallback CPU transcoding for HLS.

    Args:
        input_path: Path to input video
        output_dir: Directory to save HLS files
        transcode_config: Dict of transcoding settings
        color_info: Dict with color metadata

    Returns:
        Tuple of (success, error_message)
    """
    cmd = _get_hls_transcode_command(
        input_path, output_dir, transcode_config, use_gpu=False, color_info=color_info
    )

    logger.info(f"HLS transcoding with CPU (fallback): {input_path} -> {output_dir}")

    process = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )

    stdout, stderr = await asyncio.wait_for(
        process.communicate(), timeout=settings.VIDEO_PROCESSING_TIMEOUT
    )

    if process.returncode != 0:
        error_msg = stderr.decode()[-500:] if stderr else "Unknown error"
        logger.error(f"CPU HLS transcoding failed: {error_msg}")
        return False, f"CPU HLS transcoding failed: {error_msg}"

    logger.info(f"CPU HLS transcoding succeeded: {output_dir}")
    return True, ""


async def transcode_video_hls(
    input_path: Path,
    output_dir: Path,
    transcode_config: Optional[Dict[str, Any]] = None,
    color_info: Optional[Dict[str, Optional[str]]] = None,
) -> Tuple[bool, str]:
    """
    Transcode video to HLS format (segmented streaming).

    Creates a master.m3u8 manifest and segment files in the output directory.
    Tries GPU first if enabled, falls back to CPU on failure.

    Args:
        input_path: Path to input video
        output_dir: Directory to save HLS files
        transcode_config: Dict of transcoding settings from database
        color_info: Dict with color metadata

    Returns:
        Tuple of (success, error_message)
    """
    try:
        # Ensure output directory exists
        output_dir.mkdir(parents=True, exist_ok=True)

        # Determine if GPU should be used
        use_gpu = False
        if transcode_config:
            use_gpu = transcode_config.get("use_gpu_transcoding", False)
        else:
            use_gpu = settings.USE_GPU_TRANSCODING

        if use_gpu:
            cmd = _get_hls_transcode_command(
                input_path,
                output_dir,
                transcode_config,
                use_gpu=True,
                color_info=color_info,
            )

            logger.info(f"HLS transcoding with GPU: {input_path} -> {output_dir}")

            process = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await asyncio.wait_for(
                process.communicate(), timeout=settings.VIDEO_PROCESSING_TIMEOUT
            )

            if process.returncode == 0:
                logger.info(f"GPU HLS transcoding succeeded: {output_dir}")
                return True, ""
            else:
                error_msg = stderr.decode()[-500:] if stderr else "Unknown error"
                logger.warning(
                    f"GPU HLS transcoding failed with exit code {process.returncode}, "
                    f"falling back to CPU: {error_msg}"
                )
                return await _transcode_hls_cpu_fallback(
                    input_path, output_dir, transcode_config, color_info=color_info
                )
        else:
            return await _transcode_hls_cpu_fallback(
                input_path, output_dir, transcode_config, color_info=color_info
            )

    except asyncio.TimeoutError:
        logger.error(
            f"HLS transcoding timed out after {settings.VIDEO_PROCESSING_TIMEOUT}s, "
            f"falling back to CPU"
        )
        return await _transcode_hls_cpu_fallback(
            input_path, output_dir, transcode_config, color_info=color_info
        )

    except Exception as e:
        use_gpu = (
            transcode_config.get("use_gpu_transcoding", False)
            if transcode_config
            else settings.USE_GPU_TRANSCODING
        )

        if use_gpu and ("nvenc" in str(e).lower() or "cuda" in str(e).lower()):
            logger.error(
                f"GPU HLS transcoding failed with CUDA/NVENC error, "
                f"falling back to CPU: {e}"
            )
            return await _transcode_hls_cpu_fallback(
                input_path, output_dir, transcode_config, color_info=color_info
            )
        else:
            logger.error(f"Error HLS transcoding video {input_path}: {e}")
            return False, f"HLS transcoding error: {str(e)}"


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
    input_path: Path,
    output_path: Path,
    thumbnail_path: Path,
    transcode_config: Optional[Dict[str, Any]] = None,
) -> Dict:
    """
    Complete video processing pipeline.

    Steps:
    1. Validate video file
    2. Extract metadata
    3. Transcode based on video_output_format config:
       - "hls": Create HLS segments in output directory
       - "progressive": Create single MP4 file (or copy if compatible)
    4. Extract thumbnail

    Args:
        input_path: Path to uploaded video
        output_path: Path to save processed video (for progressive) or
                     base path for HLS directory
        thumbnail_path: Path to save thumbnail
        transcode_config: Dict of transcoding settings from database

    Returns:
        Dict with keys: success, error, duration, width, height, codec, output_format
    """
    result = {
        "success": False,
        "error": None,
        "duration": None,
        "width": None,
        "height": None,
        "codec": None,
        "output_format": "progressive",  # Track which format was used
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

    # Extract color info from metadata to pass to transcoder
    color_info: Dict[str, Optional[str]] = {
        "color_range": metadata.get("color_range"),
        "color_space": metadata.get("color_space"),
        "color_transfer": metadata.get("color_transfer"),
        "color_primaries": metadata.get("color_primaries"),
        "pix_fmt": metadata.get("pix_fmt"),
    }

    # Determine output format from config
    video_output_format = "hls"  # Default to HLS
    if transcode_config:
        video_output_format = transcode_config.get("video_output_format", "hls")

    if video_output_format == "hls":
        # HLS output - create directory with segments
        # output_path is used as the base path, HLS files go in a subdirectory
        hls_dir = output_path.parent / output_path.stem
        hls_dir.mkdir(parents=True, exist_ok=True)

        logger.info(f"Processing video for HLS output: {input_path} -> {hls_dir}")

        success, error_msg = await transcode_video_hls(
            input_path, hls_dir, transcode_config, color_info=color_info
        )
        if not success:
            result["error"] = error_msg
            return result

        result["output_format"] = "hls"

        # For HLS, use the first segment or manifest to extract thumbnail
        manifest_path = hls_dir / "master.m3u8"
        if manifest_path.exists():
            # Extract thumbnail from input (or we could use a segment)
            thumbnail_success = await extract_thumbnail(
                input_path, thumbnail_path, timestamp=1.0
            )
        else:
            thumbnail_success = False

    else:
        # Progressive output - single MP4 file
        if await needs_transcoding(input_path):
            success, error_msg = await transcode_video(
                input_path, output_path, transcode_config, color_info=color_info
            )
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

        result["output_format"] = "progressive"

        thumbnail_success = await extract_thumbnail(
            output_path, thumbnail_path, timestamp=1.0
        )

    if not thumbnail_success:
        logger.warning(f"Thumbnail extraction failed, but continuing (non-critical)")

    result["success"] = True
    logger.info(
        f"Video processing completed successfully (format={video_output_format}): {output_path}"
    )
    return result

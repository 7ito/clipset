"""
Pydantic schemas for Config endpoints.
"""

import re
from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field, field_validator
from app.schemas.base import BaseResponse


# Valid options for transcoding settings
NVENC_PRESETS = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"]
NVENC_RATE_CONTROLS = ["vbr", "cbr", "constqp"]
CPU_PRESETS = [
    "ultrafast",
    "superfast",
    "veryfast",
    "faster",
    "fast",
    "medium",
    "slow",
    "slower",
    "veryslow",
]
RESOLUTIONS = ["720p", "1080p", "1440p", "4k"]
PRESET_MODES = ["quality", "balanced", "performance", "custom"]

# Regex patterns
BITRATE_PATTERN = re.compile(r"^\d+[kKmMgG]?$")


class ConfigResponse(BaseResponse):
    """Schema for reading system configuration."""

    # Upload & Storage Settings
    max_file_size_bytes: int = Field(
        ..., description="Maximum file size for video uploads in bytes"
    )
    weekly_upload_limit_bytes: int = Field(
        ..., description="Weekly upload quota limit per user in bytes"
    )
    video_storage_path: str = Field(..., description="Path where videos are stored")

    # GPU Settings
    use_gpu_transcoding: bool = Field(
        ..., description="Whether to use GPU (NVENC) for transcoding"
    )
    gpu_device_id: int = Field(..., description="GPU device ID to use (0 = first GPU)")

    # NVENC Settings
    nvenc_preset: str = Field(
        ..., description="NVENC preset (p1=fastest to p7=best quality)"
    )
    nvenc_cq: int = Field(
        ..., description="NVENC constant quality (0=best to 51=worst)"
    )
    nvenc_rate_control: str = Field(
        ..., description="NVENC rate control mode (vbr, cbr, constqp)"
    )
    nvenc_max_bitrate: str = Field(
        ..., description="Maximum bitrate cap (e.g., '8M', '12M')"
    )
    nvenc_buffer_size: str = Field(
        ..., description="Buffer size for bitrate smoothing (e.g., '16M')"
    )

    # CPU Fallback Settings
    cpu_preset: str = Field(..., description="x264 CPU preset (ultrafast to veryslow)")
    cpu_crf: int = Field(
        ..., description="x264 constant rate factor (0=best to 51=worst)"
    )

    # Output Settings
    max_resolution: str = Field(
        ..., description="Maximum output resolution (720p, 1080p, 1440p, 4k)"
    )
    audio_bitrate: str = Field(..., description="Audio bitrate (e.g., '192k', '256k')")

    # Preset Mode
    transcode_preset_mode: str = Field(
        ...,
        description="Transcoding preset mode (quality, balanced, performance, custom)",
    )

    # Metadata
    updated_at: datetime = Field(..., description="Last update timestamp")
    updated_by: Optional[str] = Field(None, description="User ID who last updated")


class ConfigUpdate(BaseModel):
    """Schema for updating system configuration (all fields optional)."""

    # Upload & Storage Settings
    max_file_size_bytes: Optional[int] = Field(
        None,
        ge=1_048_576,  # Minimum 1MB
        le=10_737_418_240,  # Maximum 10GB
        description="Maximum file size for video uploads in bytes",
    )
    weekly_upload_limit_bytes: Optional[int] = Field(
        None,
        ge=1_048_576,  # Minimum 1MB
        le=107_374_182_400,  # Maximum 100GB
        description="Weekly upload quota limit per user in bytes",
    )
    video_storage_path: Optional[str] = Field(
        None,
        min_length=1,
        max_length=500,
        description="Path where videos are stored",
    )

    # GPU Settings
    use_gpu_transcoding: Optional[bool] = Field(
        None, description="Whether to use GPU (NVENC) for transcoding"
    )
    gpu_device_id: Optional[int] = Field(
        None,
        ge=0,
        le=15,  # Max 16 GPUs
        description="GPU device ID to use (0 = first GPU)",
    )

    # NVENC Settings
    nvenc_preset: Optional[str] = Field(
        None, description="NVENC preset (p1=fastest to p7=best quality)"
    )
    nvenc_cq: Optional[int] = Field(
        None,
        ge=0,
        le=51,
        description="NVENC constant quality (0=best to 51=worst)",
    )
    nvenc_rate_control: Optional[str] = Field(
        None, description="NVENC rate control mode (vbr, cbr, constqp)"
    )
    nvenc_max_bitrate: Optional[str] = Field(
        None, description="Maximum bitrate cap (e.g., '8M', '12M')"
    )
    nvenc_buffer_size: Optional[str] = Field(
        None, description="Buffer size for bitrate smoothing (e.g., '16M')"
    )

    # CPU Fallback Settings
    cpu_preset: Optional[str] = Field(
        None, description="x264 CPU preset (ultrafast to veryslow)"
    )
    cpu_crf: Optional[int] = Field(
        None,
        ge=0,
        le=51,
        description="x264 constant rate factor (0=best to 51=worst)",
    )

    # Output Settings
    max_resolution: Optional[str] = Field(
        None, description="Maximum output resolution (720p, 1080p, 1440p, 4k)"
    )
    audio_bitrate: Optional[str] = Field(
        None, description="Audio bitrate (e.g., '192k', '256k')"
    )

    # Preset Mode
    transcode_preset_mode: Optional[str] = Field(
        None,
        description="Transcoding preset mode (quality, balanced, performance, custom)",
    )

    @field_validator("video_storage_path")
    @classmethod
    def validate_path(cls, v: Optional[str]) -> Optional[str]:
        """Validate storage path format."""
        if v is None:
            return v

        v = v.strip()
        if not v:
            raise ValueError("Storage path cannot be empty")

        # Basic path validation (no null bytes, etc.)
        if "\x00" in v:
            raise ValueError("Storage path contains invalid characters")

        return v

    @field_validator("nvenc_preset")
    @classmethod
    def validate_nvenc_preset(cls, v: Optional[str]) -> Optional[str]:
        """Validate NVENC preset."""
        if v is None:
            return v
        if v not in NVENC_PRESETS:
            raise ValueError(f"NVENC preset must be one of: {', '.join(NVENC_PRESETS)}")
        return v

    @field_validator("nvenc_rate_control")
    @classmethod
    def validate_nvenc_rate_control(cls, v: Optional[str]) -> Optional[str]:
        """Validate NVENC rate control mode."""
        if v is None:
            return v
        if v not in NVENC_RATE_CONTROLS:
            raise ValueError(
                f"NVENC rate control must be one of: {', '.join(NVENC_RATE_CONTROLS)}"
            )
        return v

    @field_validator("nvenc_max_bitrate", "nvenc_buffer_size")
    @classmethod
    def validate_bitrate(cls, v: Optional[str]) -> Optional[str]:
        """Validate bitrate format (e.g., '8M', '16M', '5000k')."""
        if v is None:
            return v
        if not BITRATE_PATTERN.match(v):
            raise ValueError(
                "Bitrate must be a number optionally followed by k, K, m, M, g, or G "
                "(e.g., '8M', '16M', '5000k')"
            )
        return v.upper()  # Normalize to uppercase

    @field_validator("cpu_preset")
    @classmethod
    def validate_cpu_preset(cls, v: Optional[str]) -> Optional[str]:
        """Validate x264 CPU preset."""
        if v is None:
            return v
        if v not in CPU_PRESETS:
            raise ValueError(f"CPU preset must be one of: {', '.join(CPU_PRESETS)}")
        return v

    @field_validator("max_resolution")
    @classmethod
    def validate_resolution(cls, v: Optional[str]) -> Optional[str]:
        """Validate resolution setting."""
        if v is None:
            return v
        if v not in RESOLUTIONS:
            raise ValueError(f"Resolution must be one of: {', '.join(RESOLUTIONS)}")
        return v

    @field_validator("audio_bitrate")
    @classmethod
    def validate_audio_bitrate(cls, v: Optional[str]) -> Optional[str]:
        """Validate audio bitrate format (e.g., '192k', '256k')."""
        if v is None:
            return v
        # Audio bitrate should end with 'k'
        if not re.match(r"^\d+[kK]$", v):
            raise ValueError(
                "Audio bitrate must be a number followed by 'k' (e.g., '192k', '256k')"
            )
        return v.lower()  # Normalize to lowercase

    @field_validator("transcode_preset_mode")
    @classmethod
    def validate_preset_mode(cls, v: Optional[str]) -> Optional[str]:
        """Validate transcoding preset mode."""
        if v is None:
            return v
        if v not in PRESET_MODES:
            raise ValueError(f"Preset mode must be one of: {', '.join(PRESET_MODES)}")
        return v


class EncoderInfo(BaseModel):
    """Schema for encoder detection response."""

    gpu_available: bool = Field(..., description="Whether GPU encoding is available")
    gpu_name: Optional[str] = Field(None, description="Name of the detected GPU")
    encoders: list[str] = Field(
        default_factory=list, description="List of available encoders"
    )

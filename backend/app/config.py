from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///../data/clipset.db"

    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 43200  # 30 days

    # HLS Signed URLs - separate secret for nginx secure_link validation
    # If not set, derived from SECRET_KEY (but explicit setting recommended for production)
    HLS_SIGNING_SECRET: str = ""

    # Initial Admin User
    INITIAL_ADMIN_EMAIL: str = "admin@clipset.local"
    INITIAL_ADMIN_USERNAME: str = "admin"
    INITIAL_ADMIN_PASSWORD: str = "changeme123"

    # CORS
    BACKEND_CORS_ORIGINS: str = "http://localhost,http://localhost:5173"

    # Frontend
    FRONTEND_BASE_URL: str = "http://localhost:5173"

    # Storage Paths
    VIDEO_STORAGE_PATH: str = "../data/uploads/videos"
    THUMBNAIL_STORAGE_PATH: str = "../data/uploads/thumbnails"
    TEMP_STORAGE_PATH: str = "../data/uploads/temp"
    CHUNKS_STORAGE_PATH: str = "../data/uploads/chunks"
    CATEGORY_IMAGE_STORAGE_PATH: str = "../data/uploads/category-images"
    AVATAR_STORAGE_PATH: str = "../data/uploads/avatars"

    # Upload Limits (bytes)
    MAX_FILE_SIZE_BYTES: int = 2_147_483_648  # 2GB
    WEEKLY_UPLOAD_LIMIT_BYTES: int = 4_294_967_296  # 4GB
    MAX_CATEGORY_IMAGE_SIZE_BYTES: int = 5_242_880  # 5MB
    MAX_AVATAR_SIZE_BYTES: int = 2_097_152  # 2MB

    # Accepted Video Formats (comma-separated)
    ACCEPTED_VIDEO_FORMATS: str = "mp4,mov,avi,mkv,webm,hevc,h265"

    # Category Images
    CATEGORY_IMAGE_SIZE: tuple[int, int] = (400, 400)  # Square images
    AVATAR_IMAGE_SIZE: tuple[int, int] = (256, 256)  # Square avatars

    # FFmpeg
    FFMPEG_PATH: str = "ffmpeg"  # Uses system PATH

    # Video Processing
    VIDEO_PROCESSING_TIMEOUT: int = 1800  # 30 minutes in seconds

    # GPU Transcoding Settings
    USE_GPU_TRANSCODING: bool = False
    GPU_DEVICE_ID: int = 0
    NVENC_PRESET: str = "p4"  # p1 (fastest) to p7 (slowest, best quality)
    NVENC_CQ: int = 18  # Constant quality: 0 (best) to 51 (worst), 18 = high quality
    NVENC_RATE_CONTROL: str = "vbr"  # vbr, cbr, constqp
    NVENC_MAX_BITRATE: str = "8M"  # Maximum bitrate cap
    NVENC_BUFFER_SIZE: str = "16M"  # 2x maxrate for VBR smoothness

    # Quota Reset Schedule
    QUOTA_RESET_DAY: int = 0  # 0 = Sunday
    QUOTA_RESET_HOUR: int = 0  # Midnight
    QUOTA_RESET_TIMEZONE: str = "UTC"

    @property
    def cors_origins(self) -> List[str]:
        """Parse CORS origins from comma-separated string."""
        return [origin.strip() for origin in self.BACKEND_CORS_ORIGINS.split(",")]

    @property
    def accepted_formats(self) -> List[str]:
        """Parse accepted video formats from comma-separated string."""
        return [fmt.strip().lower() for fmt in self.ACCEPTED_VIDEO_FORMATS.split(",")]

    @property
    def hls_signing_secret(self) -> str:
        """
        Get HLS signing secret for nginx secure_link validation.
        If not explicitly set, derives from SECRET_KEY using HMAC.
        """
        if self.HLS_SIGNING_SECRET:
            return self.HLS_SIGNING_SECRET
        # Derive from SECRET_KEY if not set
        import hashlib

        return hashlib.sha256(f"{self.SECRET_KEY}:hls-signing".encode()).hexdigest()[
            :32
        ]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

# Validate SECRET_KEY length
if len(settings.SECRET_KEY) < 32:
    raise ValueError("SECRET_KEY must be at least 32 characters long")

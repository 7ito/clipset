from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/clipset.db"

    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 43200  # 30 days

    # Initial Admin User
    INITIAL_ADMIN_EMAIL: str = "admin@clipset.local"
    INITIAL_ADMIN_USERNAME: str = "admin"
    INITIAL_ADMIN_PASSWORD: str = "changeme123"

    # CORS
    BACKEND_CORS_ORIGINS: str = "http://localhost,http://localhost:5173"

    # Frontend
    FRONTEND_BASE_URL: str = "http://localhost:5173"

    # Storage Paths
    VIDEO_STORAGE_PATH: str = "./data/uploads/videos"
    THUMBNAIL_STORAGE_PATH: str = "./data/uploads/thumbnails"
    TEMP_STORAGE_PATH: str = "./data/uploads/temp"

    # Upload Limits (bytes)
    MAX_FILE_SIZE_BYTES: int = 2_147_483_648  # 2GB
    WEEKLY_UPLOAD_LIMIT_BYTES: int = 4_294_967_296  # 4GB

    # Accepted Video Formats (comma-separated)
    ACCEPTED_VIDEO_FORMATS: str = "mp4,mov,avi,mkv,webm"

    # FFmpeg
    FFMPEG_PATH: str = "ffmpeg"  # Uses system PATH

    # Video Processing
    VIDEO_PROCESSING_TIMEOUT: int = 300  # 5 minutes in seconds

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

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

# Validate SECRET_KEY length
if len(settings.SECRET_KEY) < 32:
    raise ValueError("SECRET_KEY must be at least 32 characters long")

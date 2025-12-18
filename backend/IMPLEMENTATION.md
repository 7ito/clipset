# Backend Implementation Plan

## Overview
FastAPI backend for Clipset video sharing platform with SQLite database, JWT authentication, and FFmpeg video processing.

---

## Technology Stack
- **Framework**: FastAPI 0.109.0
- **Database**: SQLite with SQLAlchemy ORM
- **Migrations**: Alembic
- **Authentication**: JWT (python-jose)
- **Password Hashing**: bcrypt (passlib)
- **Video Processing**: FFmpeg (ffmpeg-python)
- **Background Jobs**: APScheduler
- **Async Database**: aiosqlite

---

## Project Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                      # FastAPI app, startup/shutdown events
│   ├── config.py                    # Pydantic settings
│   ├── database.py                  # Database connection & session
│   │
│   ├── models/                      # SQLAlchemy models
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── invitation.py
│   │   ├── category.py
│   │   ├── video.py
│   │   └── config.py
│   │
│   ├── schemas/                     # Pydantic schemas (request/response)
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── auth.py
│   │   ├── invitation.py
│   │   ├── category.py
│   │   ├── video.py
│   │   └── config.py
│   │
│   ├── api/                         # API endpoints
│   │   ├── __init__.py
│   │   ├── deps.py                  # Dependencies (get_db, get_current_user, etc.)
│   │   ├── auth.py                  # /api/auth endpoints
│   │   ├── users.py                 # /api/users endpoints
│   │   ├── invitations.py           # /api/invitations endpoints
│   │   ├── categories.py            # /api/categories endpoints
│   │   ├── videos.py                # /api/videos endpoints
│   │   └── admin.py                 # /api/admin endpoints
│   │
│   ├── services/                    # Business logic
│   │   ├── __init__.py
│   │   ├── auth.py                  # JWT creation/validation, password hashing
│   │   ├── config.py                # Config service
│   │   ├── video_processor.py       # FFmpeg operations
│   │   ├── storage.py               # File system operations
│   │   ├── upload_quota.py          # Quota checking/tracking
│   │   └── scheduler.py             # APScheduler setup
│   │
│   └── utils/
│       ├── __init__.py
│       ├── pagination.py            # Pagination helpers
│       └── security.py              # Security utilities
│
├── alembic/                         # Database migrations
│   ├── versions/
│   ├── env.py
│   └── script.py.mako
│
├── tests/                           # Tests (future)
│   └── __init__.py
│
├── requirements.txt
├── .env.example
├── Dockerfile
├── .dockerignore
├── .gitignore
└── README.md
```

---

## Implementation Phases

### Phase 1: Project Setup & Configuration (2-3 hours)

#### 1.1 Create requirements.txt
```txt
# Core
fastapi==0.109.0
uvicorn[standard]==0.27.0
python-multipart==0.0.6
python-dotenv==1.0.0

# Database
sqlalchemy==2.0.25
alembic==1.13.1
aiosqlite==0.19.0

# Data Validation
pydantic==2.5.3
pydantic-settings==2.1.0

# Authentication
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4

# Background Jobs
apscheduler==3.10.4

# Video Processing
ffmpeg-python==0.2.0
pillow==10.2.0
```

#### 1.2 Create .env.example
```env
# Database
DATABASE_URL=sqlite+aiosqlite:///./data/clipset.db

# Security
SECRET_KEY=your-secret-key-change-this-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=43200

# Storage
VIDEO_STORAGE_PATH=/data/videos
THUMBNAIL_STORAGE_PATH=/data/thumbnails

# Upload Limits (bytes)
MAX_FILE_SIZE_BYTES=2147483648
WEEKLY_UPLOAD_LIMIT_BYTES=4294967296

# FFmpeg
FFMPEG_PATH=/usr/bin/ffmpeg

# Accepted Formats (comma-separated)
ACCEPTED_VIDEO_FORMATS=mp4,mov,avi,mkv,webm

# Quota Reset Schedule
QUOTA_RESET_DAY=0
QUOTA_RESET_HOUR=0
QUOTA_RESET_TIMEZONE=UTC

# Initial Admin
INITIAL_ADMIN_EMAIL=admin@clipset.local
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=changeme123

# CORS
BACKEND_CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

#### 1.3 Create app/config.py
```python
from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/clipset.db"
    
    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 43200
    
    # Storage
    VIDEO_STORAGE_PATH: str = "/data/videos"
    THUMBNAIL_STORAGE_PATH: str = "/data/thumbnails"
    
    # Upload Limits
    MAX_FILE_SIZE_BYTES: int = 2147483648
    WEEKLY_UPLOAD_LIMIT_BYTES: int = 4294967296
    
    # FFmpeg
    FFMPEG_PATH: str = "/usr/bin/ffmpeg"
    ACCEPTED_VIDEO_FORMATS: str = "mp4,mov,avi,mkv,webm"
    
    # Quota Reset
    QUOTA_RESET_DAY: int = 0
    QUOTA_RESET_HOUR: int = 0
    QUOTA_RESET_TIMEZONE: str = "UTC"
    
    # Initial Admin
    INITIAL_ADMIN_EMAIL: str
    INITIAL_ADMIN_USERNAME: str
    INITIAL_ADMIN_PASSWORD: str
    
    # CORS
    BACKEND_CORS_ORIGINS: str = "http://localhost:5173"
    
    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.BACKEND_CORS_ORIGINS.split(",")]
    
    @property
    def accepted_formats(self) -> List[str]:
        return [fmt.strip() for fmt in self.ACCEPTED_VIDEO_FORMATS.split(",")]
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
```

#### 1.4 Create .gitignore
```
__pycache__/
*.py[cod]
*$py.class
*.so
.env
.venv
venv/
*.db
*.db-journal
data/
.pytest_cache/
.coverage
htmlcov/
dist/
build/
*.egg-info/
```

**Deliverables:**
- ✅ requirements.txt with all dependencies
- ✅ .env.example with all configuration options
- ✅ app/config.py with Pydantic settings
- ✅ .gitignore

---

### Phase 2: Database Setup (3-4 hours)

#### 2.1 Create database.py
```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from app.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=True,  # Set to False in production
    future=True
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
```

#### 2.2 Create SQLAlchemy Models

**models/user.py**
```python
from sqlalchemy import Column, String, Boolean, BigInteger, DateTime, Enum
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
from datetime import datetime
import uuid
import enum

class UserRole(str, enum.Enum):
    USER = "user"
    ADMIN = "admin"

class User(Base):
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.USER, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    is_active = Column(Boolean, nullable=False, default=True)
    weekly_upload_bytes = Column(BigInteger, nullable=False, default=0)
    last_upload_reset = Column(DateTime, nullable=False, default=datetime.utcnow)
```

**models/invitation.py** - Invitation model
**models/category.py** - Category model
**models/video.py** - Video model with processing status
**models/config.py** - Config model (single-row table)

#### 2.3 Initialize Alembic
```bash
alembic init alembic
```

Configure `alembic/env.py` to use async engine and import all models.

#### 2.4 Create Initial Migration
```bash
alembic revision --autogenerate -m "Initial schema"
alembic upgrade head
```

**Deliverables:**
- ✅ database.py with async SQLAlchemy setup
- ✅ All 5 models (User, Invitation, Category, Video, Config)
- ✅ Alembic configuration
- ✅ Initial migration

---

### Phase 3: Authentication System (4-5 hours)

#### 3.1 Create services/auth.py
- Password hashing with bcrypt
- JWT token creation and validation
- User authentication logic

```python
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def decode_access_token(token: str) -> dict:
    # Returns payload or raises JWTError
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
```

#### 3.2 Create api/deps.py
- `get_db()` dependency
- `get_current_user()` dependency
- `require_admin()` dependency

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.auth import decode_access_token
from app.models.user import User, UserRole

security = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    # Decode JWT and fetch user from database
    # Raise HTTPException if invalid
    pass

async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
```

#### 3.3 Create Pydantic Schemas
**schemas/auth.py**
- `LoginRequest`
- `RegisterRequest`
- `TokenResponse`

**schemas/user.py**
- `UserBase`
- `UserCreate`
- `UserResponse`
- `UserUpdate`

#### 3.4 Create api/auth.py
Endpoints:
- `POST /api/auth/register` - Register with invitation token
- `POST /api/auth/login` - Login with username/password
- `GET /api/auth/me` - Get current user info

#### 3.5 Create Startup Event for Initial Admin
In `app/main.py`:
```python
@app.on_event("startup")
async def startup_event():
    async with AsyncSessionLocal() as db:
        # Create initial admin if no admin exists
        # Create config record if doesn't exist
        # Create storage directories
        pass
```

**Deliverables:**
- ✅ Authentication service with JWT and password hashing
- ✅ Dependencies for current user and admin checks
- ✅ Auth endpoints (register, login, me)
- ✅ Initial admin creation on startup
- ✅ Pydantic schemas for auth and users

---

### Phase 4: User & Invitation Management (3-4 hours)

#### 4.1 Create api/invitations.py
- `POST /api/invitations` - Create invitation (admin)
- `GET /api/invitations` - List invitations (admin)
- `GET /api/invitations/validate/{token}` - Validate token
- `DELETE /api/invitations/{id}` - Revoke invitation (admin)

#### 4.2 Create api/users.py
- `GET /api/users` - List users (admin, paginated)
- `GET /api/users/{id}` - Get user profile
- `GET /api/users/{id}/videos` - Get user's videos (paginated)
- `PATCH /api/users/{id}/role` - Change role (admin)
- `PATCH /api/users/{id}/active` - Toggle active status (admin)
- `DELETE /api/users/{id}` - Delete user (admin)

#### 4.3 Create utils/pagination.py
```python
from typing import Generic, TypeVar, List
from pydantic import BaseModel

T = TypeVar('T')

class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int
    total_pages: int
```

**Deliverables:**
- ✅ Invitation CRUD endpoints
- ✅ User management endpoints
- ✅ Pagination utilities
- ✅ Invitation validation logic

---

### Phase 5: Video Upload & Storage (5-6 hours)

#### 5.1 Create services/storage.py
```python
import os
import uuid
from pathlib import Path
from app.config import settings

class StorageService:
    def __init__(self):
        self.video_path = Path(settings.VIDEO_STORAGE_PATH)
        self.thumbnail_path = Path(settings.THUMBNAIL_STORAGE_PATH)
        self._ensure_directories()
    
    def _ensure_directories(self):
        self.video_path.mkdir(parents=True, exist_ok=True)
        self.thumbnail_path.mkdir(parents=True, exist_ok=True)
    
    def generate_filename(self, extension: str) -> str:
        return f"{uuid.uuid4()}.{extension}"
    
    async def save_video(self, file_data: bytes, filename: str) -> str:
        # Save video file and return path
        pass
    
    async def delete_video(self, filename: str):
        # Delete video file
        pass
    
    # Similar for thumbnails
```

#### 5.2 Create services/upload_quota.py
```python
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User
from app.services.config import ConfigService

class UploadQuotaService:
    async def check_quota(self, db: AsyncSession, user: User, file_size: int) -> bool:
        config = await ConfigService().get_config(db)
        
        # Check single file size limit
        if file_size > config.max_file_size_bytes:
            return False
        
        # Check weekly quota
        if user.weekly_upload_bytes + file_size > config.weekly_upload_limit_bytes:
            return False
        
        return True
    
    async def increment_quota(self, db: AsyncSession, user: User, file_size: int):
        user.weekly_upload_bytes += file_size
        await db.commit()
```

#### 5.3 Create api/videos.py - Upload Endpoint
```python
@router.post("/", response_model=VideoResponse)
async def upload_video(
    file: UploadFile,
    title: str = Form(...),
    description: Optional[str] = Form(None),
    category_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    background_tasks: BackgroundTasks
):
    # 1. Validate file format
    # 2. Validate file size
    # 3. Check user quota
    # 4. Save file temporarily
    # 5. Create video record with status 'pending'
    # 6. Add background task for processing
    # 7. Return video object
    pass
```

**Deliverables:**
- ✅ Storage service for file operations
- ✅ Upload quota checking and tracking
- ✅ Video upload endpoint with validation
- ✅ Temporary file handling

---

### Phase 6: Video Processing with FFmpeg (4-5 hours)

#### 6.1 Create services/video_processor.py
```python
import ffmpeg
from pathlib import Path
from app.config import settings

class VideoProcessor:
    def __init__(self):
        self.ffmpeg_path = settings.FFMPEG_PATH
    
    async def transcode_video(self, input_path: str, output_path: str) -> dict:
        """
        Transcode video to 1080p H264 MP4
        Returns: dict with duration, file_size, etc.
        """
        try:
            stream = ffmpeg.input(input_path)
            stream = ffmpeg.output(
                stream,
                output_path,
                vf='scale=-2:1080',
                vcodec='libx264',
                preset='medium',
                crf=23,
                acodec='aac',
                audio_bitrate='128k',
                movflags='+faststart'
            )
            ffmpeg.run(stream, overwrite_output=True, capture_stdout=True, capture_stderr=True)
            
            # Get video info
            probe = ffmpeg.probe(output_path)
            duration = float(probe['format']['duration'])
            file_size = int(probe['format']['size'])
            
            return {
                'duration_seconds': duration,
                'file_size_bytes': file_size,
                'success': True
            }
        except ffmpeg.Error as e:
            return {
                'success': False,
                'error': e.stderr.decode()
            }
    
    async def extract_thumbnail(self, video_path: str, output_path: str, timestamp: float = 1.0):
        """
        Extract frame at timestamp as thumbnail
        """
        try:
            stream = ffmpeg.input(video_path, ss=timestamp)
            stream = ffmpeg.output(
                stream,
                output_path,
                vframes=1,
                vf='scale=-2:360'
            )
            ffmpeg.run(stream, overwrite_output=True, capture_stdout=True, capture_stderr=True)
            return True
        except ffmpeg.Error:
            return False
```

#### 6.2 Create Background Task for Processing
```python
async def process_video_task(video_id: str):
    """
    Background task to process uploaded video
    """
    async with AsyncSessionLocal() as db:
        # 1. Get video record
        # 2. Update status to 'processing'
        # 3. Transcode video
        # 4. Extract thumbnail
        # 5. Update video record with results
        # 6. Delete temporary file
        # 7. Handle errors (set status to 'failed')
        pass
```

#### 6.3 Add Background Task to Upload Endpoint
```python
# In upload_video endpoint:
background_tasks.add_task(process_video_task, str(video.id))
```

**Deliverables:**
- ✅ Video processor service with FFmpeg
- ✅ Transcoding to 1080p H264 MP4
- ✅ Thumbnail extraction at 1 second
- ✅ Background task for async processing
- ✅ Error handling and status updates

---

### Phase 7: Video Management & Streaming (3-4 hours)

#### 7.1 Create Video Endpoints
```python
# api/videos.py

@router.get("/", response_model=PaginatedResponse[VideoResponse])
async def list_videos(
    page: int = 1,
    page_size: int = 10,
    category_id: Optional[str] = None,
    uploaded_by: Optional[str] = None,
    sort_by: str = "created_at",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Query with filters and pagination
    pass

@router.get("/{video_id}", response_model=VideoResponse)
async def get_video(
    video_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    pass

@router.patch("/{video_id}", response_model=VideoResponse)
async def update_video(
    video_id: str,
    update_data: VideoUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Only owner or admin can update
    pass

@router.delete("/{video_id}")
async def delete_video(
    video_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Only owner or admin can delete
    # Delete video file, thumbnail, and database record
    pass
```

#### 7.2 Create Streaming Endpoint
```python
from fastapi.responses import StreamingResponse, FileResponse
from fastapi import Header

@router.get("/{video_id}/stream")
async def stream_video(
    video_id: str,
    range: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Stream video with byte-range support for seeking
    """
    # Get video from database
    # Check file exists
    # Handle Range header for partial content
    # Return StreamingResponse or FileResponse
    pass

@router.get("/{video_id}/thumbnail")
async def get_thumbnail(
    video_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Return thumbnail image
    return FileResponse(thumbnail_path)
```

#### 7.3 Create View Count Endpoint
```python
@router.post("/{video_id}/view")
async def increment_view_count(
    video_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    video = await get_video_or_404(db, video_id)
    video.view_count += 1
    await db.commit()
    return {"view_count": video.view_count}
```

**Deliverables:**
- ✅ Video listing with filters and pagination
- ✅ Video CRUD endpoints
- ✅ Video streaming with byte-range support
- ✅ Thumbnail serving
- ✅ View count tracking

---

### Phase 8: Categories (2-3 hours)

#### 8.1 Create api/categories.py
```python
@router.get("/", response_model=List[CategoryResponse])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    pass

@router.post("/", response_model=CategoryResponse)
async def create_category(
    category_data: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    # Generate slug from name
    pass

@router.patch("/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: str,
    category_data: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    pass

@router.delete("/{category_id}")
async def delete_category(
    category_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    # Category deletion sets videos' category_id to NULL
    pass
```

**Deliverables:**
- ✅ Category CRUD endpoints
- ✅ Slug generation from name
- ✅ Admin-only access

---

### Phase 9: Config Management (2-3 hours)

#### 9.1 Create services/config.py
```python
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.config import Config
from uuid import UUID

class ConfigService:
    async def get_config(self, db: AsyncSession) -> Config:
        config = await db.query(Config).filter_by(id=1).first()
        if not config:
            # Create with defaults if missing
            config = Config(id=1)
            db.add(config)
            await db.commit()
        return config
    
    async def update_config(
        self,
        db: AsyncSession,
        user_id: UUID,
        **kwargs
    ) -> Config:
        config = await self.get_config(db)
        
        for key, value in kwargs.items():
            if hasattr(config, key) and value is not None:
                setattr(config, key, value)
        
        config.updated_by = user_id
        config.updated_at = datetime.utcnow()
        await db.commit()
        return config
```

#### 9.2 Create api/admin.py
```python
@router.get("/config", response_model=ConfigResponse)
async def get_config(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    pass

@router.patch("/config", response_model=ConfigResponse)
async def update_config(
    config_data: ConfigUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    pass

@router.get("/stats", response_model=AdminStatsResponse)
async def get_admin_stats(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    # Return: total users, videos, storage used, processing queue
    pass
```

**Deliverables:**
- ✅ Config service
- ✅ Config endpoints (get, update)
- ✅ Admin stats endpoint

---

### Phase 10: Weekly Quota Reset Job (2 hours)

#### 10.1 Create services/scheduler.py
```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from app.config import settings
from app.database import AsyncSessionLocal

class SchedulerService:
    def __init__(self):
        self.scheduler = AsyncIOScheduler(timezone=settings.QUOTA_RESET_TIMEZONE)
    
    async def reset_weekly_quotas(self):
        """Reset all users' weekly upload bytes to 0"""
        async with AsyncSessionLocal() as db:
            users = await db.query(User).all()
            for user in users:
                user.weekly_upload_bytes = 0
                user.last_upload_reset = datetime.utcnow()
            await db.commit()
            print(f"Reset weekly quotas for {len(users)} users")
    
    def start(self):
        # Schedule quota reset: Sunday at midnight
        self.scheduler.add_job(
            self.reset_weekly_quotas,
            CronTrigger(
                day_of_week=settings.QUOTA_RESET_DAY,
                hour=settings.QUOTA_RESET_HOUR,
                minute=0
            ),
            id='reset_weekly_quotas',
            replace_existing=True
        )
        self.scheduler.start()
    
    def shutdown(self):
        self.scheduler.shutdown()
```

#### 10.2 Add to main.py
```python
from app.services.scheduler import SchedulerService

scheduler = SchedulerService()

@app.on_event("startup")
async def startup_event():
    # ... existing startup code ...
    scheduler.start()

@app.on_event("shutdown")
async def shutdown_event():
    scheduler.shutdown()
```

**Deliverables:**
- ✅ Scheduler service with APScheduler
- ✅ Weekly quota reset job (Sunday midnight)
- ✅ Integration with FastAPI lifecycle

---

### Phase 11: Main Application & CORS (1-2 hours)

#### 11.1 Create app/main.py
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api import auth, users, invitations, categories, videos, admin
from app.database import engine, Base
from app.services.scheduler import SchedulerService

app = FastAPI(
    title="Clipset API",
    description="Private video sharing platform",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(invitations.router, prefix="/api/invitations", tags=["invitations"])
app.include_router(categories.router, prefix="/api/categories", tags=["categories"])
app.include_router(videos.router, prefix="/api/videos", tags=["videos"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])

scheduler = SchedulerService()

@app.on_event("startup")
async def startup_event():
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Create initial admin and config
    async with AsyncSessionLocal() as db:
        await create_initial_admin(db)
        await create_initial_config(db)
    
    # Start scheduler
    scheduler.start()

@app.on_event("shutdown")
async def shutdown_event():
    scheduler.shutdown()

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
```

**Deliverables:**
- ✅ Main FastAPI app with all routers
- ✅ CORS middleware
- ✅ Startup/shutdown events
- ✅ Health check endpoint

---

## Testing Checklist

### Manual Testing
- [ ] Register with invitation token
- [ ] Login with username/password
- [ ] Upload video (MP4, MOV, AVI, MKV, WEBM)
- [ ] Verify video transcoding to 1080p H264
- [ ] Verify thumbnail generation
- [ ] Stream video (check seeking works)
- [ ] Update video metadata
- [ ] Delete video (verify file deletion)
- [ ] Create/update/delete categories
- [ ] Assign video to category
- [ ] Check upload quota enforcement
- [ ] Test weekly quota reset (manually trigger)
- [ ] Admin: manage users
- [ ] Admin: create invitations
- [ ] Admin: update config
- [ ] Admin: view stats

### API Documentation
- FastAPI auto-generates docs at `/docs` (Swagger UI)
- Test all endpoints via Swagger UI

---

## Running the Backend

```bash
# Install dependencies
pip install -r requirements.txt

# Copy .env.example to .env and configure
cp .env.example .env

# Run migrations
alembic upgrade head

# Run development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

---

## Next Steps After MVP

1. **Add proper logging** (structlog or loguru)
2. **Add comprehensive tests** (pytest + pytest-asyncio)
3. **Add rate limiting** (slowapi)
4. **Add proper error handling** (custom exception handlers)
5. **Add request validation** (more robust Pydantic models)
6. **Add database connection pooling tuning**
7. **Consider Celery** for video processing if needed
8. **Add video processing queue monitoring**
9. **Add metrics/monitoring** (Prometheus)
10. **Optimize database queries** (eager loading, indexes)

---

## Migration to PostgreSQL

When ready to scale:

1. Update `requirements.txt`:
   ```
   - aiosqlite==0.19.0
   + asyncpg==0.29.0
   ```

2. Update `DATABASE_URL`:
   ```
   postgresql+asyncpg://user:pass@localhost/clipset
   ```

3. Run migrations:
   ```bash
   alembic upgrade head
   ```

4. No code changes needed (SQLAlchemy abstracts this)

---

## Migration to Go

Keep this API contract documented. When migrating to Go:
- Reimplement same endpoints
- Keep same request/response schemas
- Reuse SQLite/PostgreSQL database
- Frontend needs no changes

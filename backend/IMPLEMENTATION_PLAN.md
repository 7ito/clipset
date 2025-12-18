# Backend Implementation Plan

## Technology Stack
- Python 3.11+
- FastAPI
- SQLAlchemy + Alembic (migrations)
- SQLite → PostgreSQL migration path
- JWT authentication
- FFmpeg for video processing
- APScheduler for background jobs

---

## Project Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI app + startup events
│   ├── config.py               # Pydantic settings
│   ├── database.py             # SQLAlchemy setup
│   ├── models/                 # SQLAlchemy models
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── video.py
│   │   ├── category.py
│   │   ├── invitation.py
│   │   └── config.py
│   ├── schemas/                # Pydantic schemas
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── video.py
│   │   ├── category.py
│   │   ├── invitation.py
│   │   ├── auth.py
│   │   └── config.py
│   ├── api/                    # Route handlers
│   │   ├── __init__.py
│   │   ├── deps.py             # Dependencies (auth, DB session)
│   │   ├── auth.py
│   │   ├── users.py
│   │   ├── videos.py
│   │   ├── categories.py
│   │   ├── invitations.py
│   │   └── admin.py
│   ├── services/               # Business logic
│   │   ├── __init__.py
│   │   ├── auth.py             # JWT, password hashing
│   │   ├── video_processor.py # FFmpeg operations
│   │   ├── storage.py          # File operations
│   │   ├── upload_quota.py     # Quota management
│   │   ├── config.py           # Config service
│   │   └── scheduler.py        # APScheduler setup
│   └── utils/
│       ├── __init__.py
│       ├── security.py
│       └── pagination.py
├── alembic/
│   ├── versions/
│   ├── env.py
│   └── alembic.ini
├── requirements.txt
├── Dockerfile
└── .dockerignore
```

---

## Phase 1: Project Setup

### 1.1 Dependencies
Create `requirements.txt`:
```
fastapi==0.109.0
uvicorn[standard]==0.27.0
sqlalchemy==2.0.25
alembic==1.13.1
pydantic==2.5.3
pydantic-settings==2.1.0
python-multipart==0.0.6
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-dotenv==1.0.0
apscheduler==3.10.4
aiosqlite==0.19.0
ffmpeg-python==0.2.0
```

### 1.2 Configuration
Create `app/config.py` with Pydantic Settings:
- Database URL
- JWT secret key, algorithm, expiration
- Storage paths (videos, thumbnails)
- Upload limits
- FFmpeg path
- Initial admin credentials
- CORS origins

### 1.3 Database Setup
- `app/database.py`: SQLAlchemy engine, session factory
- Initialize Alembic: `alembic init alembic`
- Configure `alembic.ini` and `env.py`

---

## Phase 2: Database Models

Create SQLAlchemy models in `app/models/`:

### 2.1 User Model (`user.py`)
- Fields: id, email, username, password_hash, role, created_at, is_active, weekly_upload_bytes, last_upload_reset
- Relationships: videos (one-to-many), invitations (one-to-many)

### 2.2 Invitation Model (`invitation.py`)
- Fields: id, email, token, created_by, created_at, expires_at, used, used_at
- Relationships: creator (many-to-one User)

### 2.3 Category Model (`category.py`)
- Fields: id, name, slug, created_by, created_at
- Relationships: videos (one-to-many), creator (many-to-one User)

### 2.4 Video Model (`video.py`)
- Fields: id, title, description, filename, thumbnail_filename, original_filename, file_size_bytes, duration_seconds, uploaded_by, category_id, view_count, processing_status, error_message, created_at
- Relationships: uploader (many-to-one User), category (many-to-one Category)

### 2.5 Config Model (`config.py`)
- Fields: id (=1), max_file_size_bytes, weekly_upload_limit_bytes, video_storage_path, updated_at, updated_by
- Single-row constraint

### 2.6 Create Initial Migration
```bash
alembic revision --autogenerate -m "Initial schema"
alembic upgrade head
```

---

## Phase 3: Authentication System

### 3.1 Security Utilities (`app/utils/security.py`)
- Password hashing (bcrypt)
- JWT token creation/validation
- Token payload structure: `{user_id, username, role, exp}`

### 3.2 Auth Service (`app/services/auth.py`)
- `authenticate_user(username, password)`: Validate credentials
- `create_access_token(user)`: Generate JWT
- `verify_token(token)`: Decode and validate JWT

### 3.3 Auth Dependencies (`app/api/deps.py`)
- `get_db()`: Database session dependency
- `get_current_user()`: Extract user from JWT token
- `get_current_active_user()`: Check user is active
- `require_admin()`: Ensure user has admin role

### 3.4 Auth Routes (`app/api/auth.py`)
- `POST /api/auth/register`: Register with invitation token + username
- `POST /api/auth/login`: Login with username/password, return JWT
- `GET /api/auth/me`: Get current user info

---

## Phase 4: User Management

### 4.1 User Schemas (`app/schemas/user.py`)
- `UserCreate`, `UserUpdate`, `UserResponse`
- `UserProfile` (public info)

### 4.2 User Routes (`app/api/users.py`)
- `GET /api/users`: List all users (admin, paginated)
- `GET /api/users/{id}`: Get user profile
- `GET /api/users/{id}/videos`: Get user's videos (paginated)
- `PATCH /api/users/{id}/role`: Change role (admin)
- `PATCH /api/users/{id}/active`: Toggle active status (admin)
- `DELETE /api/users/{id}`: Delete user (admin)

---

## Phase 5: Invitation System

### 5.1 Invitation Schemas (`app/schemas/invitation.py`)
- `InvitationCreate`, `InvitationResponse`

### 5.2 Invitation Routes (`app/api/invitations.py`)
- `POST /api/invitations`: Create invitation (admin)
  - Generate unique token (UUID)
  - Set expiry (7 days from creation)
  - Return invitation link
- `GET /api/invitations`: List invitations (admin)
- `GET /api/invitations/validate/{token}`: Validate token (public)
- `DELETE /api/invitations/{id}`: Revoke invitation (admin)

---

## Phase 6: Video Upload & Processing

### 6.1 Storage Service (`app/services/storage.py`)
- `save_uploaded_file(file, filename)`: Save to temp location
- `move_processed_file(src, dest)`: Move to final storage
- `delete_file(path)`: Remove file
- `get_file_path(filename)`: Resolve file path
- `check_disk_space(required_bytes)`: Ensure space available

### 6.2 Video Processor (`app/services/video_processor.py`)
- `transcode_video(input_path, output_path)`: FFmpeg to 1080p H264 MP4
  - Command: `ffmpeg -i input -vf "scale=-2:1080" -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k -movflags +faststart output.mp4`
- `extract_thumbnail(video_path, output_path, timestamp=1.0)`: Extract frame at 1 second
  - Command: `ffmpeg -i input -ss 00:00:01 -vframes 1 -vf "scale=-2:360" output.jpg`
- `get_video_duration(path)`: Extract duration metadata
- `process_video_async(video_id)`: Background task orchestration

### 6.3 Upload Quota Service (`app/services/upload_quota.py`)
- `check_user_quota(user, file_size)`: Validate against weekly limit
- `increment_user_quota(user, file_size)`: Add to weekly total
- `reset_all_quotas()`: Reset all users' weekly_upload_bytes to 0 (for scheduler)

### 6.4 Video Schemas (`app/schemas/video.py`)
- `VideoCreate`, `VideoUpdate`, `VideoResponse`
- Processing status enum

### 6.5 Video Routes (`app/api/videos.py`)
- `POST /api/videos`: Upload video (multipart form)
  1. Validate file format (MP4, MOV, AVI, MKV, WEBM)
  2. Check file size against config
  3. Check user quota
  4. Save to temp location
  5. Create Video record (status: pending)
  6. Start background processing task
  7. Return video object immediately
- `GET /api/videos`: List all videos (paginated, filterable by category/user, sortable)
- `GET /api/videos/{id}`: Get video details
- `PATCH /api/videos/{id}`: Update metadata (owner/admin)
- `DELETE /api/videos/{id}`: Delete video + files (owner/admin)
- `POST /api/videos/{id}/view`: Increment view count
- `GET /api/videos/{id}/stream`: Stream video file with byte-range support
- `GET /api/videos/{id}/thumbnail`: Serve thumbnail image

### 6.6 Background Processing
Use FastAPI BackgroundTasks:
1. Update status to "processing"
2. Run transcode
3. Generate thumbnail
4. Extract duration
5. Update record with processed file info
6. Set status to "completed" or "failed"
7. Delete temp/original file

---

## Phase 7: Categories

### 7.1 Category Schemas (`app/schemas/category.py`)
- `CategoryCreate`, `CategoryUpdate`, `CategoryResponse`

### 7.2 Category Routes (`app/api/categories.py`)
- `GET /api/categories`: List all categories
- `POST /api/categories`: Create category (admin)
  - Auto-generate slug from name
- `PATCH /api/categories/{id}`: Update category (admin)
- `DELETE /api/categories/{id}`: Delete category (admin)

---

## Phase 8: Configuration Management

### 8.1 Config Service (`app/services/config.py`)
- `get_config(db)`: Get config record (id=1)
- `update_config(db, user_id, **kwargs)`: Update config values

### 8.2 Config Schemas (`app/schemas/config.py`)
- `ConfigUpdate`, `ConfigResponse`

### 8.3 Admin Routes (`app/api/admin.py`)
- `GET /api/admin/stats`: Dashboard stats
  - Total users, videos, storage used, processing queue length
- `GET /api/admin/config`: Get config
- `PATCH /api/admin/config`: Update config (admin)

---

## Phase 9: Background Jobs

### 9.1 Scheduler Setup (`app/services/scheduler.py`)
- Initialize APScheduler with SQLite job store
- Register cron jobs

### 9.2 Weekly Quota Reset Job
- Schedule: `0 0 * * 0` (Sunday midnight UTC)
- Action: Reset all users' `weekly_upload_bytes = 0`, update `last_upload_reset`

---

## Phase 10: Application Bootstrap

### 10.1 Main App (`app/main.py`)
- Create FastAPI app
- Configure CORS
- Include routers (auth, users, videos, categories, invitations, admin)
- Startup event:
  - Create database tables (or use Alembic)
  - Create initial admin user if no admins exist
  - Initialize config record if doesn't exist
  - Start APScheduler
- Shutdown event:
  - Stop scheduler

### 10.2 API Structure
```python
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(videos.router, prefix="/api/videos", tags=["videos"])
app.include_router(categories.router, prefix="/api/categories", tags=["categories"])
app.include_router(invitations.router, prefix="/api/invitations", tags=["invitations"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
```

---

## Phase 11: Pagination & Filtering

### 11.1 Pagination Utility (`app/utils/pagination.py`)
- `paginate(query, page, page_size)`: Apply LIMIT/OFFSET
- Default page size: 10
- Max page size: 100

### 11.2 Video Filtering
Query params for `GET /api/videos`:
- `page` (default: 1)
- `page_size` (default: 10, max: 100)
- `category_id` (filter by category)
- `uploaded_by` (filter by user)
- `sort_by` (options: `created_at`, `view_count`)
- `order` (options: `asc`, `desc`)

---

## Phase 12: Error Handling

### 12.1 Custom Exceptions
- `InvitationInvalidError`
- `InvitationExpiredError`
- `QuotaExceededError`
- `FileFormatNotSupportedError`
- `VideoProcessingError`

### 12.2 Exception Handlers
- Return appropriate HTTP status codes
- Consistent error response format: `{detail: string, error_code: string}`

---

## Phase 13: Testing Considerations

### 13.1 Manual Testing Endpoints
- Create test user via invitation
- Upload sample videos (various formats)
- Test quota limits
- Test video processing pipeline
- Test admin operations

### 13.2 Database Seeding (Optional)
- Script to create sample categories
- Script to create sample videos for testing

---

## Phase 14: Documentation

### 14.1 API Docs
- FastAPI auto-generates OpenAPI docs at `/docs`
- Add docstrings to route handlers

### 14.2 README
- Setup instructions
- Environment variables
- Running migrations
- Creating first admin user

---

## Migration to PostgreSQL

When ready to scale:

1. Update `requirements.txt`: Replace `aiosqlite` with `asyncpg`
2. Update `DATABASE_URL` in `.env`: `postgresql+asyncpg://user:pass@host/db`
3. Run Alembic migrations: `alembic upgrade head`
4. Update Docker Compose to include PostgreSQL service
5. Migrate data if needed (export/import or pg_dump)

---

## Implementation Order

1. Phase 1-2: Project setup + database models
2. Phase 3: Authentication system
3. Phase 4-5: User management + invitations
4. Phase 6: Video upload + processing (core feature)
5. Phase 7: Categories
6. Phase 8: Config management
7. Phase 9: Background jobs
8. Phase 10-12: Bootstrap, pagination, error handling
9. Phase 13-14: Testing + docs

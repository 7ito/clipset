# Clipset Go Backend - Implementation Plan

This document outlines the complete plan for rewriting the Clipset backend from Python/FastAPI to Go, with PostgreSQL replacing SQLite.

## Overview

| Aspect | Current | Target |
|--------|---------|--------|
| Language | Python 3.11 | Go 1.22+ |
| Framework | FastAPI | net/http (stdlib) |
| Database | SQLite | PostgreSQL |
| ORM/Queries | SQLAlchemy | sqlc |
| Job Queue | FastAPI BackgroundTasks | River |
| Migrations | Alembic | golang-migrate |

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **HTTP** | `net/http` + `http.ServeMux` | Go 1.22+ has pattern matching, no framework needed |
| **Database** | PostgreSQL via `pgx/v5` | Best Go PostgreSQL driver, excellent connection pool |
| **SQL Generation** | `sqlc` | Type-safe queries from SQL |
| **Migrations** | `golang-migrate` | Industry standard, PostgreSQL native |
| **Job Queue** | `River` | PostgreSQL-backed, Go-native, uses LISTEN/NOTIFY |
| **JWT** | `golang-jwt/jwt/v5` | Standard library style |
| **Password Hashing** | `golang.org/x/crypto/bcrypt` | Stdlib-adjacent |
| **Config** | `caarlos0/env` | Minimal, struct tag based |
| **Validation** | `go-playground/validator` | Struct tag validation |
| **UUID** | `google/uuid` | Standard |
| **NanoID** | `matoous/go-nanoid/v2` | Short IDs for videos/playlists |
| **Image Processing** | `disintegration/imaging` | Pure Go, no CGO required |

## Connection Pooling

Using `pgxpool` (built into pgx) with recommended settings:

```go
config.MaxConns = 25              // Max connections
config.MinConns = 5               // Keep warm connections
config.MaxConnLifetime = time.Hour
config.MaxConnIdleTime = 30 * time.Minute
config.HealthCheckPeriod = time.Minute
```

No external connection pooler (PgBouncer) needed for single-instance deployments.

---

## Project Structure

```
clipset-go/
├── cmd/
│   └── clipset/
│       └── main.go                 # Entry point (server + migrate subcommand)
├── internal/
│   ├── api/
│   │   ├── handlers/
│   │   │   ├── auth.go             # Login, register, password reset
│   │   │   ├── users.go            # User CRUD, avatar, directory
│   │   │   ├── videos.go           # Upload, stream, CRUD
│   │   │   ├── playlists.go        # Playlist CRUD
│   │   │   ├── comments.go         # Comment CRUD
│   │   │   ├── categories.go       # Category CRUD
│   │   │   ├── invitations.go      # Invite system
│   │   │   ├── config.go           # Admin config
│   │   │   └── health.go           # Health check
│   │   ├── middleware/
│   │   │   ├── auth.go             # JWT validation
│   │   │   ├── admin.go            # Admin-only routes
│   │   │   ├── logging.go          # Request logging
│   │   │   └── cors.go             # CORS handling
│   │   ├── response/
│   │   │   └── json.go             # JSON response helpers
│   │   └── router.go               # Route registration
│   ├── config/
│   │   └── config.go               # Environment config struct
│   ├── db/
│   │   ├── migrations/
│   │   │   ├── 000001_initial_schema.up.sql
│   │   │   └── 000001_initial_schema.down.sql
│   │   ├── queries/
│   │   │   ├── users.sql           # User queries
│   │   │   ├── videos.sql          # Video queries
│   │   │   ├── playlists.sql       # Playlist queries
│   │   │   ├── comments.sql        # Comment queries
│   │   │   ├── categories.sql      # Category queries
│   │   │   ├── invitations.sql     # Invitation queries
│   │   │   ├── config.sql          # Config queries
│   │   │   └── password_reset.sql  # Password reset queries
│   │   ├── sqlc/                   # Generated code (do not edit)
│   │   └── db.go                   # Pool setup and helpers
│   ├── domain/
│   │   ├── user.go                 # User types, validation
│   │   ├── video.go                # Video types, enums
│   │   ├── playlist.go             # Playlist types
│   │   ├── comment.go              # Comment types
│   │   ├── category.go             # Category types
│   │   ├── invitation.go           # Invitation types
│   │   └── config.go               # Config types
│   ├── services/
│   │   ├── auth/
│   │   │   ├── jwt.go              # JWT creation/validation
│   │   │   ├── password.go         # Bcrypt hashing
│   │   │   └── service.go          # Auth business logic
│   │   ├── video/
│   │   │   ├── processor.go        # FFmpeg transcoding
│   │   │   ├── metadata.go         # FFprobe extraction
│   │   │   ├── thumbnail.go        # Thumbnail generation
│   │   │   └── service.go          # Video business logic
│   │   ├── storage/
│   │   │   ├── local.go            # Local filesystem
│   │   │   └── storage.go          # Storage interface
│   │   ├── image/
│   │   │   └── processor.go        # Avatar/category image processing
│   │   └── upload/
│   │       └── chunked.go          # Chunked upload manager
│   ├── worker/
│   │   ├── river.go                # River queue setup
│   │   ├── transcode.go            # Video transcoding job
│   │   └── migration.go            # HLS migration job
│   └── migrate/
│       └── sqlite.go               # SQLite -> PostgreSQL migration
├── Dockerfile
├── Dockerfile.gpu
├── docker-compose.yml
├── go.mod
├── go.sum
├── sqlc.yaml
├── Makefile
└── IMPLEMENTATION_PLAN.md          # This file
```

---

## PostgreSQL Schema

```sql
-- Enums
CREATE TYPE user_role AS ENUM ('user', 'admin');
CREATE TYPE processing_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    avatar_filename VARCHAR(255),
    weekly_upload_bytes BIGINT NOT NULL DEFAULT 0,
    last_upload_reset TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);

-- Invitations
CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at TIMESTAMPTZ
);
CREATE INDEX idx_invitations_email ON invitations(email);
CREATE INDEX idx_invitations_token ON invitations(token);

-- Categories
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    image_filename VARCHAR(255),
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_categories_name ON categories(name);
CREATE INDEX idx_categories_slug ON categories(slug);

-- Videos
CREATE TABLE videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    short_id VARCHAR(10) NOT NULL UNIQUE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    filename VARCHAR(255) NOT NULL UNIQUE,
    thumbnail_filename VARCHAR(255),
    original_filename VARCHAR(255) NOT NULL,
    storage_path VARCHAR(500),
    file_size_bytes BIGINT NOT NULL,
    duration_seconds INTEGER,
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    view_count INTEGER NOT NULL DEFAULT 0,
    processing_status processing_status NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_videos_short_id ON videos(short_id);
CREATE INDEX idx_videos_title ON videos(title);
CREATE INDEX idx_videos_uploaded_by ON videos(uploaded_by);
CREATE INDEX idx_videos_category_id ON videos(category_id);
CREATE INDEX idx_videos_processing_status ON videos(processing_status);
CREATE INDEX idx_videos_created_at ON videos(created_at);

-- Playlists
CREATE TABLE playlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    short_id VARCHAR(10) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_playlists_short_id ON playlists(short_id);
CREATE INDEX idx_playlists_created_by ON playlists(created_by);
CREATE INDEX idx_playlists_is_public ON playlists(is_public);

-- Playlist Videos (junction table)
CREATE TABLE playlist_videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    added_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(playlist_id, video_id)
);
CREATE INDEX idx_playlist_videos_playlist_id ON playlist_videos(playlist_id);
CREATE INDEX idx_playlist_videos_video_id ON playlist_videos(video_id);
CREATE INDEX idx_playlist_videos_position ON playlist_videos(playlist_id, position);

-- Comments (self-referential for replies)
CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    timestamp_seconds INTEGER,
    parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_comments_video_id ON comments(video_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);
CREATE INDEX idx_comments_parent_id ON comments(parent_id);

-- Password Reset Tokens
CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_password_reset_tokens_hash ON password_reset_tokens(token_hash);

-- Config (singleton table)
CREATE TABLE config (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    max_file_size_bytes BIGINT NOT NULL DEFAULT 2147483648,
    weekly_upload_limit_bytes BIGINT NOT NULL DEFAULT 4294967296,
    video_storage_path VARCHAR(500) NOT NULL DEFAULT './data/uploads/videos',
    use_gpu_transcoding BOOLEAN NOT NULL DEFAULT FALSE,
    gpu_device_id INTEGER NOT NULL DEFAULT 0,
    nvenc_preset VARCHAR(10) NOT NULL DEFAULT 'p4',
    nvenc_cq INTEGER NOT NULL DEFAULT 18,
    nvenc_rate_control VARCHAR(20) NOT NULL DEFAULT 'vbr',
    nvenc_max_bitrate VARCHAR(20) NOT NULL DEFAULT '8M',
    nvenc_buffer_size VARCHAR(20) NOT NULL DEFAULT '16M',
    cpu_preset VARCHAR(20) NOT NULL DEFAULT 'medium',
    cpu_crf INTEGER NOT NULL DEFAULT 18,
    max_resolution VARCHAR(10) NOT NULL DEFAULT '1080p',
    audio_bitrate VARCHAR(20) NOT NULL DEFAULT '192k',
    transcode_preset_mode VARCHAR(20) NOT NULL DEFAULT 'balanced',
    video_output_format VARCHAR(20) NOT NULL DEFAULT 'hls',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Insert default config row
INSERT INTO config (id) VALUES (1);
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2) - COMPLETED

- [x] Initialize Go modules (`go mod init`)
- [x] Add dependencies to `go.mod`
- [x] Create project directory structure
- [x] Write PostgreSQL schema migration (`000001_initial_schema.up.sql`)
- [x] Configure sqlc (`sqlc.yaml`)
- [x] Write initial SQL queries for all tables
- [x] Generate sqlc code
- [x] Implement database connection pool setup
- [x] Implement configuration loading from environment
- [x] Basic HTTP server skeleton with health check endpoint

**Deliverables:**
- `go.mod`, `go.sum`
- `sqlc.yaml` and generated code
- Database migrations
- Config struct
- `/api/health` endpoint working

### Phase 2: Authentication (Week 2-3) - COMPLETED

- [x] JWT token creation and validation
- [x] Password hashing with bcrypt
- [x] Auth middleware (Bearer token extraction)
- [x] Query param token support for streaming endpoints
- [x] `POST /api/auth/login`
- [x] `POST /api/auth/register` (with invitation validation)
- [x] `GET /api/auth/me`
- [x] `POST /api/auth/forgot-password`
- [x] `GET /api/auth/verify-reset-token`
- [x] `POST /api/auth/reset-password`

**Deliverables:**
- Working authentication flow
- JWT middleware
- Password reset flow

### Phase 3: User Management (Week 3) - COMPLETED

- [x] `GET /api/users/` (admin only, paginated)
- [x] `GET /api/users/directory` (search, sort)
- [x] `GET /api/users/by-username/{username}`
- [x] `GET /api/users/{user_id}`
- [x] `POST /api/users/me/avatar`
- [x] `DELETE /api/users/me/avatar`
- [x] `DELETE /api/users/{user_id}` (soft delete, admin only)
- [x] `POST /api/users/{user_id}/activate` (admin only)
- [x] `POST /api/users/{user_id}/generate-reset-link` (admin only)
- [x] Image processing for avatars (resize to 256x256, convert to JPEG)
- [ ] Upload quota tracking logic (deferred to Phase 5 - Video Core)

**Deliverables:**
- All user endpoints
- Avatar upload/serving
- Admin user management

**Note:** Avatar images are converted to JPEG instead of WebP because the pure Go
`disintegration/imaging` library has better JPEG support. WebP encoding would
require CGO or external dependencies.

### Phase 4: Categories (Week 3) - COMPLETED

- [x] `GET /api/categories/`
- [x] `POST /api/categories/` (admin only)
- [x] `GET /api/categories/{category_id}`
- [x] `GET /api/categories/slug/{slug}`
- [x] `PATCH /api/categories/{category_id}` (admin only)
- [x] `DELETE /api/categories/{category_id}` (admin only)
- [x] `POST /api/categories/{category_id}/image` (admin only)
- [x] `GET /api/categories/{category_id}/image` (authenticated)
- [x] `DELETE /api/categories/{category_id}/image` (admin only)
- [x] Slug generation from name
- [x] Image processing (resize to 400x400, convert to JPEG)

**Deliverables:**
- All category endpoints
- Category image handling

**Note:** Category images are converted to JPEG (consistent with avatars) and the
image serving endpoint requires authentication for security.

### Phase 5: Video Core (Week 4-5) - COMPLETED

- [x] `POST /api/videos/upload` (simple single-file upload)
- [x] `POST /api/videos/upload/init` (chunked upload initialization with pre-check)
- [x] `POST /api/videos/upload/chunk` (receive chunks)
- [x] `POST /api/videos/upload/complete` (assemble and process)
- [x] `GET /api/videos/` (with filters, pagination, search, sort, access control)
- [x] `GET /api/videos/{short_id}`
- [x] `PATCH /api/videos/{short_id}`
- [x] `DELETE /api/videos/{short_id}`
- [x] `GET /api/videos/quota/me`
- [x] `POST /api/videos/admin/quota/reset-all` (admin only)
- [x] Short ID generation with nanoid (with retry logic for collisions)
- [x] Chunked upload manager (temp storage, assembly)
- [x] Upload quota enforcement
- [x] Basic video file validation (magic bytes check)

**Deliverables:**
- Video CRUD operations
- Simple and chunked upload
- Quota management
- Storage service for file operations

**Note:** Video processing (Phase 6) is stubbed - videos are created with
`processing_status = 'pending'` and a log message indicates where River
job queue integration will be added.

### Phase 6: Video Processing (Week 5-7) - COMPLETED

- [x] Set up River job queue
- [x] FFmpeg service abstraction
- [x] Video validation (ffprobe check for video stream)
- [x] Metadata extraction (duration, dimensions, codec, color info)
- [x] Thumbnail generation (frame at 1 second, 640px width)
- [x] Progressive MP4 transcoding (CPU/libx264)
- [x] Progressive MP4 transcoding (GPU/NVENC with CPU fallback)
- [x] HLS transcoding (CPU/libx264)
- [x] HLS transcoding (GPU/NVENC with CPU fallback)
- [x] Transcoding preset handling (from database config)
- [x] Color space preservation
- [x] Processing status updates in database
- [x] Error handling and job retries
- [x] Transcode job worker

**FFmpeg Commands to Implement:**

Progressive (CPU):
```bash
ffmpeg -i input.mov \
  -vf "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease" \
  -c:v libx264 -pix_fmt yuv420p -preset medium -crf 18 \
  -color_range tv -c:a aac -b:a 192k -movflags +faststart \
  -y output.mp4
```

Progressive (NVENC):
```bash
ffmpeg -i input.mov \
  -vf "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease" \
  -c:v h264_nvenc -pix_fmt yuv420p -preset p4 -rc vbr -cq 18 \
  -b:v 0 -maxrate 8M -bufsize 16M -color_range tv \
  -c:a aac -b:a 192k -movflags +faststart \
  -y output.mp4
```

HLS (CPU):
```bash
ffmpeg -i input.mov \
  -vf "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease" \
  -c:v libx264 -pix_fmt yuv420p -preset medium -crf 18 \
  -color_range tv -c:a aac -b:a 192k \
  -f hls -hls_time 4 -hls_list_size 0 -hls_segment_type mpegts \
  -hls_segment_filename "/path/segment%03d.ts" \
  -y /path/master.m3u8
```

HLS (NVENC):
```bash
ffmpeg -i input.mov \
  -vf "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease" \
  -c:v h264_nvenc -pix_fmt yuv420p -preset p4 -rc vbr -cq 18 \
  -b:v 0 -maxrate 8M -bufsize 16M -color_range tv \
  -c:a aac -b:a 192k \
  -f hls -hls_time 4 -hls_list_size 0 -hls_segment_type mpegts \
  -hls_segment_filename "/path/segment%03d.ts" \
  -y /path/master.m3u8
```

Thumbnail:
```bash
ffmpeg -ss 1.00 -i video.mp4 -vframes 1 -vf "scale=640:-1" -q:v 2 -y thumbnail.jpg
```

**Deliverables:**
- River job queue integration
- Complete FFmpeg transcoding pipeline
- Thumbnail generation
- Processing status tracking

### Phase 7: Video Streaming (Week 7-8)

- [ ] `GET /api/videos/{short_id}/stream` (progressive, Range request support)
- [ ] `GET /api/videos/{short_id}/hls/{filename}` (manifest and segments)
- [ ] `GET /api/videos/{short_id}/stream-info`
- [ ] `GET /api/videos/{short_id}/thumbnail`
- [ ] `POST /api/videos/{short_id}/view` (increment view count)
- [ ] HTTP Range request handling for progressive streaming
- [ ] HLS URL signing (nginx secure_link compatible)
- [ ] Query param token authentication for all streaming endpoints

**HLS Signing (nginx secure_link compatible):**
```go
expires := time.Now().Unix() + 43200 // 12 hours
uri := fmt.Sprintf("/hls/%s", path)
toSign := fmt.Sprintf("%d%s %s", expires, uri, secret)
hash := md5.Sum([]byte(toSign))
token := base64.URLEncoding.EncodeToString(hash[:])
token = strings.TrimRight(token, "=")
return fmt.Sprintf("%s?md5=%s&expires=%d", uri, token, expires)
```

**Deliverables:**
- Progressive video streaming
- HLS streaming
- Thumbnail serving
- View tracking

### Phase 8: Playlists (Week 8)

- [ ] `GET /api/playlists/by-user/{username}`
- [ ] `POST /api/playlists/`
- [ ] `GET /api/playlists/{short_id}`
- [ ] `PATCH /api/playlists/{short_id}`
- [ ] `DELETE /api/playlists/{short_id}`
- [ ] `POST /api/playlists/{short_id}/videos/batch`
- [ ] `POST /api/playlists/{short_id}/videos`
- [ ] `DELETE /api/playlists/{short_id}/videos/{video_id}`
- [ ] `PATCH /api/playlists/{short_id}/reorder`
- [ ] `GET /api/playlists/videos/{video_id}/playlists`
- [ ] Position management for playlist videos
- [ ] First video thumbnail for playlist response

**Deliverables:**
- All playlist endpoints
- Video ordering within playlists

### Phase 9: Comments (Week 9)

- [ ] `GET /api/videos/{video_id}/comments` (with sorting)
- [ ] `POST /api/videos/{video_id}/comments`
- [ ] `PATCH /api/comments/{comment_id}` (24h edit window)
- [ ] `DELETE /api/comments/{comment_id}`
- [ ] `GET /api/videos/{video_id}/comment-markers`
- [ ] Reply support (single-level nesting)
- [ ] Edit permission logic (author only, within 24 hours)
- [ ] Delete permission logic (author, video owner, or admin)
- [ ] Comment markers aggregation for video timeline

**Deliverables:**
- All comment endpoints
- Reply system
- Permission enforcement
- Timeline markers

### Phase 10: Invitations (Week 9)

- [ ] `POST /api/invitations/` (admin only)
- [ ] `GET /api/invitations/` (admin only)
- [ ] `GET /api/invitations/validate/{token}`
- [ ] `DELETE /api/invitations/{invitation_id}` (admin only)
- [ ] Token generation (secrets.token_urlsafe equivalent)
- [ ] Expiration checking
- [ ] Registration validation

**Deliverables:**
- Invitation system
- Token validation for registration

### Phase 11: Admin Config (Week 9)

- [ ] `GET /api/config/` (admin only)
- [ ] `PATCH /api/config/` (admin only)
- [ ] `GET /api/config/encoders` (admin only)
- [ ] `GET /api/config/hls-migration-status` (admin only)
- [ ] Encoder detection (`ffmpeg -encoders`)
- [ ] GPU detection (`nvidia-smi`)
- [ ] HLS migration background job
- [ ] Migration status tracking

**Deliverables:**
- Config management
- Encoder/GPU detection
- HLS migration job

### Phase 12: Migration Tool (Week 10)

- [ ] `./clipset migrate` subcommand
- [ ] SQLite connection (read-only)
- [ ] PostgreSQL connection
- [ ] Table-by-table migration respecting foreign keys:
  1. users
  2. config
  3. invitations
  4. categories
  5. videos
  6. playlists
  7. playlist_videos
  8. comments
  9. password_reset_tokens
- [ ] UUID string to native UUID handling
- [ ] Timestamp conversion
- [ ] Batch inserts for performance
- [ ] Row count verification
- [ ] Dry-run mode (`--dry-run`)
- [ ] Progress reporting

**CLI Interface:**
```bash
./clipset migrate \
  --sqlite-path /path/to/clipset.db \
  --postgres-url postgres://user:pass@host:5432/clipset \
  --dry-run
```

**Deliverables:**
- Working migration tool
- Data integrity verification
- Progress output

### Phase 13: Docker & Deployment (Week 10-11)

- [ ] Multi-stage Dockerfile (build + minimal runtime)
- [ ] Dockerfile.gpu with NVIDIA runtime
- [ ] docker-compose.yml with:
  - Go backend
  - PostgreSQL
  - nginx (for HLS serving)
- [ ] Environment variable documentation
- [ ] Health check configuration
- [ ] Graceful shutdown handling
- [ ] Volume mounts for data persistence
- [ ] nginx configuration for HLS secure_link

**Deliverables:**
- Production-ready Docker setup
- GPU support
- nginx configuration

### Phase 14: Testing & Polish (Week 11-12)

- [ ] Manual testing of all 62 endpoints against React frontend
- [ ] Verify upload flow (simple and chunked)
- [ ] Verify transcoding (CPU and GPU)
- [ ] Verify HLS streaming
- [ ] Verify authentication flow
- [ ] Verify admin functions
- [ ] Performance testing with concurrent uploads
- [ ] Fix any compatibility issues with frontend
- [ ] Update frontend docker/proxy config if needed

**Deliverables:**
- Fully tested backend
- Frontend compatibility confirmed

---

## API Endpoint Checklist

### Auth (6 endpoints) - COMPLETED
- [x] `POST /api/auth/register`
- [x] `POST /api/auth/login`
- [x] `GET /api/auth/me`
- [x] `POST /api/auth/forgot-password`
- [x] `GET /api/auth/verify-reset-token`
- [x] `POST /api/auth/reset-password`

### Users (9 endpoints) - COMPLETED
- [x] `GET /api/users/`
- [x] `GET /api/users/directory`
- [x] `GET /api/users/by-username/{username}`
- [x] `GET /api/users/{user_id}`
- [x] `POST /api/users/me/avatar`
- [x] `DELETE /api/users/me/avatar`
- [x] `DELETE /api/users/{user_id}`
- [x] `POST /api/users/{user_id}/activate`
- [x] `POST /api/users/{user_id}/generate-reset-link`

### Videos (15 endpoints) - Phase 5 Complete (10/15)
- [x] `POST /api/videos/upload`
- [x] `POST /api/videos/upload/init`
- [x] `POST /api/videos/upload/chunk`
- [x] `POST /api/videos/upload/complete`
- [x] `GET /api/videos/`
- [x] `GET /api/videos/{short_id}`
- [x] `PATCH /api/videos/{short_id}`
- [x] `DELETE /api/videos/{short_id}`
- [ ] `GET /api/videos/{short_id}/stream` (Phase 7)
- [ ] `GET /api/videos/{short_id}/hls/{filename}` (Phase 7)
- [ ] `GET /api/videos/{short_id}/stream-info` (Phase 7)
- [ ] `GET /api/videos/{short_id}/thumbnail` (Phase 7)
- [ ] `POST /api/videos/{short_id}/view` (Phase 7)
- [x] `GET /api/videos/quota/me`
- [x] `POST /api/videos/admin/quota/reset-all`

### Playlists (10 endpoints)
- [ ] `GET /api/playlists/by-user/{username}`
- [ ] `POST /api/playlists/`
- [ ] `GET /api/playlists/{short_id}`
- [ ] `PATCH /api/playlists/{short_id}`
- [ ] `DELETE /api/playlists/{short_id}`
- [ ] `POST /api/playlists/{short_id}/videos/batch`
- [ ] `POST /api/playlists/{short_id}/videos`
- [ ] `DELETE /api/playlists/{short_id}/videos/{video_id}`
- [ ] `PATCH /api/playlists/{short_id}/reorder`
- [ ] `GET /api/playlists/videos/{video_id}/playlists`

### Comments (5 endpoints)
- [ ] `GET /api/videos/{video_id}/comments`
- [ ] `POST /api/videos/{video_id}/comments`
- [ ] `PATCH /api/comments/{comment_id}`
- [ ] `DELETE /api/comments/{comment_id}`
- [ ] `GET /api/videos/{video_id}/comment-markers`

### Categories (9 endpoints) - COMPLETED
- [x] `GET /api/categories/`
- [x] `POST /api/categories/`
- [x] `GET /api/categories/{category_id}`
- [x] `GET /api/categories/slug/{slug}`
- [x] `PATCH /api/categories/{category_id}`
- [x] `DELETE /api/categories/{category_id}`
- [x] `POST /api/categories/{category_id}/image`
- [x] `GET /api/categories/{category_id}/image`
- [x] `DELETE /api/categories/{category_id}/image`

### Invitations (4 endpoints)
- [ ] `POST /api/invitations/`
- [ ] `GET /api/invitations/`
- [ ] `GET /api/invitations/validate/{token}`
- [ ] `DELETE /api/invitations/{invitation_id}`

### Config (4 endpoints)
- [ ] `GET /api/config/`
- [ ] `PATCH /api/config/`
- [ ] `GET /api/config/encoders`
- [ ] `GET /api/config/hls-migration-status`

### Utility (2 endpoints) - COMPLETED
- [x] `GET /`
- [x] `GET /api/health`

**Total: 64 endpoints**

---

## File Storage Layout

```
data/
├── uploads/
│   ├── videos/
│   │   ├── {uuid}_{timestamp}/        # HLS video directory
│   │   │   ├── master.m3u8
│   │   │   ├── segment000.ts
│   │   │   └── ...
│   │   └── {uuid}_{timestamp}.mp4     # Progressive video
│   ├── thumbnails/
│   │   └── {uuid}_{timestamp}.jpg
│   ├── temp/
│   │   └── {uuid}_{timestamp}.{ext}
│   ├── chunks/
│   │   └── {upload_id}/
│   │       ├── chunk_00000
│   │       └── ...
│   ├── category-images/
│   │   └── {category_id}.webp
│   └── avatars/
│       └── {user_id}_{short_uuid}.webp
```

---

## Environment Variables

```bash
# Database
DATABASE_URL=postgres://user:password@localhost:5432/clipset?sslmode=disable

# Server
PORT=8000
HOST=0.0.0.0

# JWT
JWT_SECRET=your-secret-key-minimum-32-characters
JWT_EXPIRY_HOURS=720  # 30 days

# Storage paths
VIDEO_STORAGE_PATH=/data/uploads/videos
THUMBNAIL_STORAGE_PATH=/data/uploads/thumbnails
TEMP_STORAGE_PATH=/data/uploads/temp
CHUNKS_STORAGE_PATH=/data/uploads/chunks
CATEGORY_IMAGE_STORAGE_PATH=/data/uploads/category-images
AVATAR_STORAGE_PATH=/data/uploads/avatars

# Initial admin (created on first startup)
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=changeme

# HLS signing
HLS_SIGNING_SECRET=your-hls-signing-secret

# Optional: CORS
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

---

## Dependencies (go.mod)

```
github.com/jackc/pgx/v5
github.com/golang-migrate/migrate/v4
github.com/riverqueue/river
github.com/riverqueue/river/riverdriver/riverpgxv5
github.com/golang-jwt/jwt/v5
github.com/google/uuid
github.com/matoous/go-nanoid/v2
github.com/go-playground/validator/v10
github.com/caarlos0/env/v10
github.com/disintegration/imaging
golang.org/x/crypto
modernc.org/sqlite  # For migration tool only
```

---

## Notes

### Key Differences from Python Implementation

1. **Concurrency Model**: Go's goroutines vs Python's async/await. River handles job workers as separate goroutines.

2. **Error Handling**: Explicit error returns instead of exceptions. All errors must be checked.

3. **JSON Handling**: Using `encoding/json` with struct tags. Need to ensure field names match Python's response format exactly.

4. **Date/Time**: Go uses `time.Time` with explicit timezone handling. PostgreSQL TIMESTAMPTZ stores UTC.

5. **Null Handling**: Using `pgx` types or pointers for nullable fields.

### Compatibility Considerations

1. **API Response Format**: Must match Python's Pydantic response schemas exactly for frontend compatibility.

2. **JWT Format**: Same structure as Python (`user_id`, `username`, `role`, `exp`).

3. **Password Hashes**: bcrypt hashes from Python are compatible with Go's bcrypt.

4. **File Paths**: Maintain same filename patterns for seamless migration.

### Future Enhancements (Post-Release)

- [ ] AMD GPU support (AMF encoder)
- [ ] S3-compatible storage backend
- [ ] WebSocket for real-time processing updates
- [ ] Rate limiting middleware
- [ ] Prometheus metrics endpoint
- [ ] OpenTelemetry tracing

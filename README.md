# Clipset

A private, self-hostable video sharing platform for friends, family, and small communities.

## Overview

Clipset provides a simple solution for sharing large video files without compression or file size limits. Deploy via Docker and share videos within your private network.

## Features

### Authentication & Access Control
- **Invitation-based registration**: Admin-generated unique invitation links tied to email addresses
- **Role-based access**: Admin and user roles with appropriate permissions
- **Secure authentication**: JWT-based auth with password hashing

### Admin Panel
- **User invitation management**: Create, view, copy, and revoke invitation links
- **Sidebar navigation**: Organized admin interface for future expansion
- **Admin-only access**: Protected routes with automatic redirection

### User Interface
- **Dark mode support**: Toggle between light and dark themes with persistence
- **Responsive design**: Works on desktop and mobile devices
- **Modern UI**: Built with React 19, TailwindCSS 4, and shadcn-ui components

### Video Quality & Transcoding
- **High-Quality Transcoding**: CRF 18 for near-visually-lossless quality
- **GPU Acceleration**: NVIDIA NVENC support with VBR+CQ rate control
- **Optimized for Mixed Content**: Gaming clips, sports footage, and camera footage
- **Adaptive Audio**: 192 kbps AAC for clear, balanced audio quality
- **Configurable Quality**: Adjust CRF, presets, and bitrates via environment variables
- **Smart Rate Control**: VBR+CQ with bitrate caps for efficient storage and smooth playback

## Tech Stack

### Frontend
- React 19 + TypeScript
- Vite (build tool)
- TailwindCSS 4
- TanStack Router + React Query
- shadcn-ui components

### Backend
- FastAPI (Python)
- SQLAlchemy (async ORM)
- SQLite database
- Pydantic validation
- JWT authentication

## Project Status

### ✅ Phase 0: Foundation (Completed)
- User authentication (login/register)
- Admin panel with sidebar navigation
- Invitation system (create, list, validate, revoke)
- Dark mode toggle
- Protected routes and access control
- Toast notifications
- Form validation
- Database seeding script with test data

### ✅ Phase 1: Backend Database Models (Completed)
- Category model (organize videos by type)
- Video model (with processing status tracking)
- Config model (runtime application settings)
- Alembic migrations setup
- Upload quota tracking (weekly limits)
- Database relationships and indexes
- Test data seeding (6 categories, 20 sample videos)

### ✅ Phase 2: Category Management (Completed)
- Category API endpoints (CRUD operations)
- Category admin UI with full management interface
- Automatic slug generation from category names
- Video count aggregation per category
- Admin-only permissions for category management
- End-to-end testing with Playwright

### ✅ Phase 3: Video Upload & Processing (Completed)
- Storage service (file operations, unique filename generation)
- Video processor (FFmpeg validation, transcoding, thumbnail extraction)
- Upload quota management (check/increment/reset)
- Background task processing
- Video upload API (multipart form with background processing)
- Video upload UI with drag-and-drop and progress tracking

### ✅ Phase 4: Video Streaming & Display (Completed)
- Videos API (list, get, update, delete, stream, thumbnail, view count)
- Video display with HTML5 player
- Byte-range streaming support for seeking
- Video metadata management
- Category filtering and search
- Processing status polling for pending videos

### ✅ Phase 5: UI/UX Refinement & Social Features (Completed)
- ✅ Created reusable shared components (EmptyState, PageHeader, LoadingSpinner, Skeletons)
- ✅ Transformed dashboard into community-first home feed
- ✅ Implemented Instagram-style user profiles (`/profile/:username`)
- ✅ Added username lookup backend endpoint (`/api/users/by-username/{username}`)
- ✅ Profile pages with avatar (initials), video count, and user's uploads
- ✅ "My Profile" dialog with quota and account information (own profile only)
- ✅ Video sorting (Newest | Most Viewed) on home feed
- ✅ Enhanced upload page with better drag-drop zone and quota display
- ✅ Polished video player page with back button and better loading states

### ✅ Phase 6: Navigation & Social Links (Completed)
- ✅ Update navbar: "Dashboard" → "Home", remove "Videos" link
- ✅ Make all usernames clickable throughout the app (link to profiles)
- ✅ Update Profile link in navbar to use dynamic route
- ✅ Fixed all broken /videos references to use /dashboard
- ✅ Upload page now redirects to user profile after success

### ✅ Phase 7: Admin Dashboard (Completed)
- ✅ Admin dashboard with statistics (total users, videos by status, storage used)
- ✅ Recent activity feed on admin dashboard
- ✅ Video processing status breakdown with visual indicators
- ✅ Admin-only route protection

### ✅ Phase 8: Twitch-Style Categories (Completed)
- ✅ Database schema for category images and playlists
- ✅ Backend API endpoints for category images (upload/serve/delete)
- ✅ Image processing service (resize to 400x400, convert to WebP)
- ✅ Category descriptions support
- ✅ Slug-based category lookups for clean URLs
- ✅ Frontend category types and API client
- ✅ Admin UI for image uploads with preview and delete
- ✅ Public category browse page with search and sort
- ✅ Individual category pages with filtered videos
- ✅ CategoryCard component with gradient fallbacks
- ✅ Navigation integration (Categories link in navbar)

### ✅ Phase 9: Playlist Feature (Complete)
- ✅ Backend: 9 REST API endpoints for full CRUD operations
- ✅ Create/Edit/Delete playlists with validation
- ✅ Add videos to playlists from multiple locations (dashboard, categories, profiles, video player)
- ✅ Drag-and-drop video reordering component (@dnd-kit)
- ✅ Multi-select video addition with search and filters
- ✅ Profile integration with tabs (Videos | Playlists)
- ✅ Playlist cards with gradient fallbacks
- ✅ Permission system (owner-only edit/manage)
- ✅ Routing fixed with layout pattern (playlist pages separate from profile)
- ✅ End-to-end testing complete (30+ verification points)
- ✅ Production-ready with full test coverage

### ✅ Phase 10: Docker Deployment & nginx Optimization (Complete)
- ✅ Docker Compose configurations (development + production)
- ✅ Nginx reverse proxy setup with hybrid static file serving (**50-67% faster**)
- ✅ External drive support via bind mounts
- ✅ Production environment configuration
- ✅ Health checks and auto-restart
- ✅ Log rotation configured
- ✅ Comprehensive deployment documentation (617 lines)
- ✅ Cloudflare Tunnel guide (338 lines)
- ✅ nginx serves thumbnails/category images (1-year cache)
- ✅ FastAPI serves videos (auth + tracking)

### ✅ Phase 11: Admin Configuration UI (Complete)
- ✅ System settings page in admin panel
- ✅ Configure max file size (1MB - 10GB) via web UI
- ✅ Configure weekly upload quota (1MB - 100GB) via web UI
- ✅ Configure video storage path via web UI
- ✅ FileSizeInput component with MB/GB unit conversion
- ✅ Real-time configuration (no restart required)
- ✅ Upload quota service reads from database config
- ✅ Validation and change tracking
- ✅ Admin-only access with proper authentication

### ✅ Phase 15: Async Video Processing (Complete)
- ✅ Converted all FFmpeg subprocess calls to async (non-blocking)
- ✅ Application remains responsive during video uploads and processing
- ✅ Users can navigate app while videos are transcoding in background
- ✅ Multiple users can upload concurrently without blocking each other's requests
- ✅ Increased video processing timeout from 5 min to 30 min for longer videos
- ✅ No infrastructure changes required (still uses FastAPI BackgroundTasks)

### ✅ Phase 16: GPU-Accelerated Transcoding (Complete)
- ✅ NVIDIA NVENC hardware acceleration for video transcoding
- ✅ **3-10x faster** processing (11.5x realtime for 1080p on RTX 3060)
- ✅ Automatic CPU fallback if GPU unavailable
- ✅ Configurable quality presets (p1-p7) and CQ settings
- ✅ Docker GPU support with nvidia-container-toolkit
- ✅ Production-tested on RTX 3060 Laptop GPU (6GB VRAM)

## Development

### Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Run database migrations (if needed)
alembic upgrade head

# Seed database with test data (optional)
python -m app.seed

# Start development server
uvicorn app.main:app --reload
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### Test Credentials

After running the seed script (`python -m app.seed`):

**Admin User:**
- Username: `admin`
- Password: `admin123`

**Test Users:**
- Username: `alice` / Password: `password123` (0% quota used)
- Username: `bob` / Password: `password123` (50% quota used)
- Username: `charlie` / Password: `password123` (100% quota used - uploads blocked)

See `backend/TEST_CREDENTIALS.md` for more details.

## API Documentation

Once the backend is running, visit:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Docker Deployment

Clipset is designed for easy self-hosting via Docker Compose.

### Quick Start

```bash
# Clone repository
git clone <repository-url> clipset
cd clipset

# Configure environment
cp .env.example .env
# Edit .env: Set SECRET_KEY and INITIAL_ADMIN_PASSWORD

# Generate secret key
openssl rand -hex 32  # Copy output to .env

# Start Clipset
docker compose up -d

# Access at http://localhost
```

### Production Deployment

```bash
# Use production compose file
docker compose -f docker-compose.prod.yml up -d --build
```

### External Drive Support

Mount external drives to `./data/external` for additional storage:

```bash
mkdir -p ./data/external
sudo mount --bind /mnt/your-drive ./data/external
# Then set VIDEO_STORAGE_PATH=/data/external/videos in admin panel
```

### Documentation

- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Complete deployment guide
- **[CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md)** - External access setup

### Default Credentials

After first start:
- Username: `admin`
- Password: Value from `.env` INITIAL_ADMIN_PASSWORD
- **⚠️ Change password immediately after first login!**

## Configuration

Backend configuration via `.env` file:
- Database path and connection
- JWT secret and authentication settings
- CORS origins
- Video storage paths (videos, thumbnails, temp)
- Upload limits (max file size, weekly quota)
- Accepted video formats
- FFmpeg configuration
- Quota reset schedule

### Video Transcoding Settings

**Quality Settings:**
- `NVENC_CQ` / CPU CRF: Target quality (0-51, lower = better, recommended 18)
  - 16-18: Near-visually-lossless (best quality)
  - 18-20: High quality (recommended for most content)
  - 20-23: Good quality (smaller files)
  - 23-28: Acceptable quality (smallest files)

**Audio Settings:**
- Audio bitrate: 192 kbps (balanced quality and file size)
- 128 kbps: Acceptable, smaller files
- 192 kbps: Good quality (default)
- 256 kbps: High quality, larger files
- 320 kbps: Maximum quality

**GPU Transcoding (NVIDIA NVENC):**
- `USE_GPU_TRANSCODING`: Enable/disable GPU acceleration (true/false)
- `NVENC_PRESET`: Speed/quality trade-off (p1=fastest to p7=slowest/best)
  - p3-p4: Balanced (recommended)
  - p5-p6: Better quality, slower
  - p7: Best quality, slowest
- `NVENC_RATE_CONTROL`: Rate control mode
  - `vbr`: Variable Bitrate (recommended for streaming)
  - `cbr`: Constant Bitrate (consistent bandwidth)
  - `constqp`: Constant Quantization (simplest)
- `NVENC_MAX_BITRATE`: Maximum bitrate cap (e.g., 8M = 8 Mbps)
- `NVENC_BUFFER_SIZE`: Buffer for bitrate smoothing (typically 2x maxrate, e.g., 16M)

**CPU Transcoding (libx264):**
- Preset can be adjusted in `video_processor.py`:
  - `medium`: Balanced (default)
  - `slow`: Better quality, 40% slower
  - `slower`: Best quality, 100% slower

**Quality vs. File Size:**
- CRF 18: ~40-50% larger files than CRF 23, significantly better quality
- CRF 16-18: Near-visually-lossless for gaming/sports/camera footage
- CRF 20-23: Good quality for general use
- CRF 24-28: Acceptable quality, optimized for storage

**Recommended Settings by Content Type:**
- Gaming Clips: CRF 18, audio 192k (fast motion, effects)
- Sports Footage: CRF 18, audio 192k (fast action, complex motion)
- Camera Footage: CRF 18, audio 192k (natural scenes, lighting changes)
- Animation: CRF 20-23, audio 128k (simpler visual complexity)

See `backend/.env.example` for all available options.

## License
---

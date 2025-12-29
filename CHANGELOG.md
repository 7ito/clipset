# Changelog

All notable changes to Clipset will be documented in this file.

## [Unreleased] - 2025-12-29

### Changed - iOS Video Player
- Switched from CSS-based "fake fullscreen" to native iOS video fullscreen (`webkitEnterFullScreen`).
- Provides native iOS fullscreen experience with built-in controls, proper orientation handling, and status bar hiding.
- Removed unused fake fullscreen CSS (~25 lines).

### Fixed - Frontend Stability
- Fixed several pre-existing build and lint errors in comment, playlist, and video player components.
- Standardized ref types and removed unused imports and variables.
- Updated user and comment types to match backend implementation.

### Added - Mobile Video Player Enhancements (COMPLETE ✅)
- **Volume Slider**: Added touch event support and `touch-action: none` to prevent page scrolling during volume adjustment.
- **Playback Speed Menu**: Implemented a responsive bottom sheet for mobile viewports with a tap-outside-to-dismiss interaction.
- **iOS Fullscreen Support**: Created a "fake" fullscreen mode for iOS using CSS transforms to force landscape orientation while maintaining custom control functionality and double-tap to skip.

### Changed - UI Refinements & Share Dialog (COMPLETE ✅)
- **Video Player Enhancements**:
  - Brightened controls gradient overlay and increased visibility of control icons and text.
  - Removed orange comment markers from the progress bar for a cleaner look.
- **Improved Sharing Experience**:
  - Replaced "Copy Link" buttons with a single "Share" button.
  - Implemented a YouTube-style Share Dialog with an optional "Start at timestamp" checkbox.
  - Automatically parses `?t=seconds` from URL to seek video on load.
- **Comment System Simplification**:
  - Simplified comment input by removing the timestamp insertion button and "Timestamps detected" badge.
  - unified uploader info and video description into a single coherent section.
- **Design Language Consistency**:
  - Reduced usage of rounded corners across the video page (containers, cards, and input fields) to match the rest of the site's boxier aesthetic.
  - Kept rounding on action buttons for better tactile feel while ensuring overall consistency.

### Added - Video Comments with Clickable Timestamps (COMPLETE ✅)
- **Full Comment System**:
  - Users can now post comments on any video.
  - Supports **single-level nested replies** for conversations.
  - **YouTube-style clickable timestamps**: Any timestamp mentioned in a comment (e.g., "0:05", "2:30", "@1:15") automatically becomes a link that seeks the video.
  - **Progress Bar Markers**: Timestamped comments appear as orange dots on the video player progress bar.
  - **Markers Toggle**: Switch in the comment section to show/hide markers on the player.
  - **Smart Sorting**: Sort comments by Newest, Oldest, or Video Timestamp.
  
- **Permissions & Editing**:
  - **Editing window**: Users can edit their comments for up to 24 hours after posting.
  - **Deletion**: Comments can be deleted by the author, the video owner, or an administrator.
  - **Owner Badges**: Video owners are clearly labeled with a badge in the comment section.
  
- **Developer Experience**:
  - Automated migration for the `comments` table.
  - Reusable comment components library.
  - Optimized marker aggregation for better performance on long videos.

### Added - GPU-Accelerated Video Transcoding (COMPLETE ✅)
- **NVIDIA NVENC Support**:
  - Implemented GPU-accelerated video transcoding using NVIDIA NVENC
  - **3-10x faster** video processing compared to CPU (8-11x realtime for 1080p)
  - Automatic CPU fallback if GPU unavailable or fails
  - **10-bit input support**: Automatically converts 10-bit (iPhone HEVC) to 8-bit for web compatibility
  - Production-tested on RTX 3060 Laptop GPU (6GB VRAM)

- **Configuration**:
  - Added GPU settings to `.env`: `USE_GPU_TRANSCODING`, `NVENC_PRESET`, `NVENC_CQ`
  - Configurable quality presets (p1-p7) and constant quality (18-30)
  - GPU transcoding enabled by default for NVIDIA-equipped systems

- **Docker Integration**:
  - Created `Dockerfile.nvenc` using NVIDIA CUDA 12.3 runtime base image
  - Updated `docker-compose.yml` and `docker-compose.prod.yml` with GPU device access
  - Mounted NVIDIA encoder libraries (`libnvidia-encode`, `libnvcuvid`) from host
  - Added `NVIDIA_VISIBLE_DEVICES=all` environment variable

- **Backend Enhancements**:
  - Updated `video_processor.py` with GPU transcode command builder
  - Added `-pix_fmt yuv420p` to force 8-bit output (required for NVENC h264)
  - **10-bit compatibility**: Handles 10-bit iPhone HEVC videos by converting to 8-bit
  - Implemented fallback mechanism: GPU → CPU on any failure
  - Added comprehensive error handling for CUDA/NVENC errors
  - Maintained all existing timeout and validation behavior

- **Performance Metrics** (RTX 3060):
  - 30-second 1080p 8-bit video: 2.6s processing time (11.5x realtime)
  - 30-second 1080p 10-bit video: 3.4s processing time (8.9x realtime)
  - 10-minute 1080p video estimate: 1-2 minutes (vs 5-10 min CPU)
  - Memory usage: 1-3GB VRAM per transcode (well within 6GB limit)
  - **Compatible with iPhone HEVC**: 10-bit videos automatically converted

- **Documentation**:
  - Added GPU Acceleration section to `DEPLOYMENT.md`
  - Updated `.env.example` with GPU settings and detailed comments
  - Documented NVENC preset guide and performance benchmarks

- **Testing**:
  - ✅ Verified GPU device access in containers with `nvidia-smi`
  - ✅ Confirmed h264_nvenc encoder availability in FFmpeg
  - ✅ Tested transcoding 1080p video at 11.5x realtime speed
  - ✅ Verified automatic CPU fallback when GPU access removed
  - ✅ Production deployment tested on Razer Blade 14 with RTX 3060

### Fixed - Non-Blocking Video Processing (COMPLETE ✅)
- **Backend Architecture Change**:
  - Converted all `subprocess.run()` calls to `asyncio.create_subprocess_exec()` in `video_processor.py`
  - Updated `background_tasks.py` to properly await async video processing functions
  - Video transcoding no longer blocks the FastAPI event loop during processing
  - Increased `VIDEO_PROCESSING_TIMEOUT` from 300s (5 min) to 1800s (30 min) for longer videos
- **Impact**:
  - Application remains fully responsive during video uploads and processing
  - Users can navigate to app while videos are being transcoded in the background
  - Multiple users can upload concurrently without blocking each other's requests
  - Longer videos (up to 30 minutes) can now be processed without timeout
- **Technical Details**:
  - Used `asyncio.create_subprocess_exec()` for non-blocking subprocess calls
  - All FFmpeg operations (validation, metadata extraction, transcoding, thumbnail extraction) now run asynchronously
  - Maintains all existing error handling and timeout behavior
- **Testing**:
  - ✅ Verified page remains responsive during upload with Playwright
  - ✅ Successfully navigated between pages while video processing was active
  - ✅ Multiple test videos processed successfully (small_test, medium_test)
  - ✅ Admin dashboard loads correctly during background processing

### Added - iOS HEVC Support (COMPLETE ✅)
- **Backend Enhancements**:
  - Expanded `ACCEPTED_VIDEO_FORMATS` to include `hevc` and `h265`.
  - Updated `video_processor` to detect 10-bit and 12-bit pixel formats.
  - Improved `transcode_video` with `-pix_fmt yuv420p` to ensure maximum web compatibility (converts 10-bit HEVC to 8-bit H.264).
  - Ensures correct color representation and playback across all modern browsers.
- **Frontend Enhancements**:
  - Updated `UploadPage` validation to accept `.hevc` and `.h265` file extensions.
  - Synchronized accepted formats between client and server.

### Added - Chunked Upload Support (Bypass Cloudflare Limits)
- **Backend Chunk Management**:
  - Created `ChunkManager` service for handling large file uploads in parts.
  - Implemented automatic chunk merging and background processing.
  - Added secure upload session tracking with unique IDs.
  - New API endpoints: `POST /api/videos/upload/init`, `POST /api/videos/upload/chunk`, `POST /api/videos/upload/complete`.
- **Frontend Automatic Chunking**:
  - Updated API client to automatically detect files > 90MB and switch to chunked mode.
  - Implemented seamless 50MB chunking to bypass Cloudflare's 100MB proxy limit.
  - Enhanced upload progress bar to show multi-step status (Uploading -> Finalizing).
- **Infrastructure**:
  - Configured persistent chunk storage at `/data/uploads/chunks`.
  - Updated production Docker environment with new storage path.

### Fixed - Production Deployment & External Access (7ito.com)
- **Frontend API Configuration**: 
  - Fixed an issue where the frontend was hardcoded to `http://localhost:8080` for API calls in production.
  - Implemented a robust fallback to relative paths (`""`) for the `apiBaseUrl` in production, ensuring compatibility with same-origin deployments and reverse proxies.
  - Added build-time environment variable support for `VITE_API_BASE_URL` in `Dockerfile.prod`.
- **Infrastructure & Docker**:
  - Updated `docker-compose.prod.yml` to use port 80 for Nginx, matching the Cloudflare Tunnel configuration for `clips.7ito.com`.
  - Configured `VITE_API_BASE_URL` as a build argument in the production compose file.
  - Fixed port mismatch between Docker configuration and running containers.
- **Verification**:
  - Verified successful login and dashboard loading on the production environment via Playwright.
  - Confirmed the fix for the double `/api/api` prefix issue in production API calls.

## [Unreleased] - 2024-12-22

### Added - Phase 13: User Profile Customization & Password Recovery (COMPLETE ✅)
- **Custom User Avatars**:
  - Implemented full support for uploading, processing, and serving user avatars.
  - Automatic resizing to 256x256 and WebP conversion for optimal performance.
  - Added `avatar_filename` to `User` model with Alembic migration.
  - New API endpoints: `POST /api/users/me/avatar` and `DELETE /api/users/me/avatar`.
  - Configured high-performance static avatar serving via Nginx.
  - Shared `UserAvatar` component with robust initials/gradient fallbacks.
- **Password Reset Flow**:
  - Secure token-based password recovery system using `PasswordResetToken` model.
  - **Console-Log Fallback**: Reset links are printed to backend logs for private self-hosting without mandatory SMTP.
  - Dedicated `/forgot-password` and `/reset-password` frontend routes.
  - Integrated "Forgot password?" link on the login page.
  - **Profile Integration**: Added "Send Password Reset Link" button directly in the "My Profile" dialog for logged-in users.

### Added - Dynamic Video Storage Path (COMPLETE ✅)
- **Configurable Storage**: Implemented full support for dynamic video storage paths. Admins can now change where videos are stored via the System Settings UI without restarting the server.
- **Database Persistence**: Added `storage_path` column to the `Video` model to track the specific storage location used at the time of upload. This ensures that changing the global storage path does not break access to existing videos.
- **Path Validation**: Added backend validation to the settings update API that verifies if a new storage path is writable by the application before saving the configuration.
- **Background Processing**: Updated the video processing pipeline to use the video's specific storage path during transcoding and thumbnail extraction.
- **Streaming & Deletion**: Refactored streaming and deletion logic to resolve file paths dynamically based on per-video storage metadata.

### Fixed
- **Authentication**: Fixed a critical 500 Internal Server Error on `/api/auth/me` caused by an ambiguous SQL join in the user statistics query. This was preventing the frontend from initializing and resulting in a "black screen".
- **Database**: Standardized user statistics queries across `auth.py` and `users.py` to use separate count queries for better reliability and performance.
- **Docker**: Identified that hot-reload was disabled in the development Dockerfile, requiring a manual restart of the backend container to apply code changes.

## [Unreleased] - 2024-12-20

### Added - User Directory & Management (COMPLETE ✅)

- **User Directory**:
  - Implemented a public-facing community directory at `/users`.
  - Added responsive user cards with engagement stats (video and playlist counts).
  - Integrated search functionality and multiple sorting options (Newest, A-Z, Most Content).
  - Created a reusable `UserAvatar` component with dynamic initials and themed gradients.

- **Admin User Management**:
  - Implemented a comprehensive management interface at `/admin/users`.
  - Added a detailed table view with user metadata, engagement stats, and join dates.
  - Implemented user activation and deactivation (soft delete) capabilities.
  - Added role-based visual indicators (Admin/User badges).

- **Backend API Enhancements**:
  - Added `GET /api/users/directory` for optimized public user listing.
  - Updated user endpoints to include aggregated video and playlist counts using efficient SQL joins.
  - Added `POST /api/users/{id}/activate` for administrative account restoration.
  - Implemented server-side searching and sorting for user lists.

- **Navigation & UI**:
  - Added "Users" to the main navigation bar.
  - Added "Users" to the admin sidebar for quick access to management.
  - Polished the mobile navigation to include the new users route.

## [Unreleased] - 2024-12-19

### Added - UI/UX Refinements & Bug Fixes (COMPLETE ✅)

- **Unified Filter Bar Refinements**:
  - Fixed an issue where filter dropdown boxes were not filling the parent div vertically in mobile view.
  - Standardized the filter bar layout across Dashboard, Categories Index, and Category Detail pages.
  - Improved mobile responsiveness by ensuring consistent height for search and filter elements when stacked.
  - Increased Category and Sort dropdown widths to ensure all labels and values fit on a single line.
  - Standardized "Sort By" to "Sort" across all pages for consistent UI.
  - Improved right-alignment for sort selections in the filter bar.
  - Verified mobile responsiveness for filter bar elements on small viewports.

- **Visual Identity & UI Polish**:
  - Rebranded the platform with a vibrant Teal/Cyan primary accent color (`oklch`).
  - Added a dynamic radial gradient background system for improved visual depth.
  - Enhanced the Navbar with a glowing, animated logo and interactive link underlines.
  - Improved `VideoCard` components with smooth lift-up hover animations and themed shadows.
  - Standardized all card gradients to a new Teal-Emerald-Cyan palette.
  - Refined `PageHeader` with themed left-borders and subtle text glows.
  - Updated global UI components (Tabs, Progress bars, Spinners) to align with the new brand identity.

- **Playlist Player Experience**:
  - Added "Playlist Queue" horizontal ribbon below the video player.
  - Implemented automatic video progression with a toggleable 3-second countdown.
  - Added seamless looping support for playlists.
  - Integrated "Previous" and "Next" navigation buttons into the video metadata section.
  - Added "Currently Playing" indicators and automatic scrolling to the active video in the queue.

- **Upload Page Enhancements**:
  - Implemented automatic video thumbnail extraction using a hidden canvas/video element.
  - Added visual preview of the selected video before upload.
  - Added loading state during preview generation.
  - Added "Change File" overlay for easier file swapping.

- **Stability & Performance**:
  - Fixed stale cache issue where newly uploaded videos didn't appear on the Home or Profile pages without a refresh.
  - Added conditional polling (`refetchInterval`) to Dashboard and Profile pages to automatically update video processing status.
  - Implemented global `videos` query invalidation upon successful upload.

### Added - Post-Phase 11 Refinement & UI/UX Polish (COMPLETE ✅)

**Completion Date**: December 19, 2024 | **Time**: ~2 hours

- **Refactoring & Performance**:
  - Extracted `VideoCard` to a shared component in `@/components/shared/VideoCard.tsx`.
  - Fixed nested `<a>` tag hydration warnings in `VideoCard` using an absolute overlay link pattern with proper z-index management.
  - Improved `VideoCard` layout to be consistent across Dashboard, Categories, and Profile pages.
  
- **Video Player Page Enhancements**:
  - Implemented an expanded, centered single-column layout (`max-w-6xl`) for better focus.
  - Implemented an expandable "Description" component with "Show more/less" for long texts.
  - Redesigned video metadata section with cleaner icons, uploader info card, and improved responsive layout.
  - Added automatic playback and better loading states.
  - Fixed missing imports (`getVideos`, `VideoIcon`) and backend auth token validation.

- **Dynamic Configuration Integration**:
  - Backend: Added `max_file_size_bytes` to `QuotaInfoResponse` schema.
  - Backend: Updated `upload_quota` service and `upload_video` API to enforce dynamic limits from database configuration.
  - Frontend: Integrated dynamic upload limits into `UploadPage` for real-time client-side validation.

- **Mobile Navigation**:
  - Polished mobile menu in `Navbar` with better spacing, icons, and a more comprehensive layout including profile and logout actions.

### Added - Phase 11: Admin Configuration UI (COMPLETE ✅)

**Completion Date**: December 19, 2024 | **Time**: ~4 hours

- **System Settings Page** (`/admin/settings`):
  - Configure max file size limit (1MB - 10GB) via web UI
  - Configure weekly upload quota (1MB - 100GB) via web UI
  - Configure video storage path via web UI
  - Real-time application without server restart
  
- **Backend**:
  - Config API endpoints (`GET /api/config/`, `PATCH /api/config/`)
  - Pydantic schemas with comprehensive validation
  - Upload quota service now reads from database config
  - Graceful fallback to environment variables on error
  
- **Frontend Components**:
  - FileSizeInput component with MB/GB unit conversion
  - PathInput component for file system paths
  - Settings link in admin sidebar
  
- **User Experience**:
  - Unsaved changes tracking with warning message
  - Save/Reset buttons with loading states
  - Toast notifications for success/error
  - Info banner explaining setting application
  - Admin-only access with proper authentication

**Files**: 7 new, 7 modified | **Code**: ~600 lines

### Fixed
- **Profile Page**: Fixed user's video list not loading by implementing a React Context provider in the profile layout and correctly consuming it in the index route via `useProfileContext`.
- **Admin Dashboard**: Fixed statistics failing to load due to missing trailing slashes in API calls causing CORS errors during redirects.
- **Thumbnails**: Fixed missing thumbnails in the development environment by generating actual image files during database seeding and ensuring the frontend uses absolute URLs for media when an API base URL is configured.
- **API Reliability**: Standardized trailing slashes across all frontend API clients to match backend routing and prevent unnecessary redirects.
- **Nginx Proxying**: Improved header handling in Nginx configuration to preserve host information and port details for proxied requests.

## [v1.0.0] - 2024-12-18

### Added - Phase 10: Docker Deployment & nginx Optimization (COMPLETE ✅)

**Completion Date**: December 18, 2024  
**Total Time**: ~3 hours  
**Status**: Production-ready

#### Docker Containerization

- **Docker Compose Configurations**:
  - `docker-compose.yml` - Development mode with hot reload
  - `docker-compose.prod.yml` - Production mode with optimized builds
  - Three-service architecture (backend, frontend, nginx)

- **Dockerfiles**:
  - `backend/Dockerfile` - Python 3.11-slim with FFmpeg
  - `frontend/Dockerfile` - Node 20 for development
  - `frontend/Dockerfile.prod` - Multi-stage build with nginx

#### nginx Hybrid Static File Serving (KEY OPTIMIZATION)

- **Performance Improvement**: 50-67% faster thumbnail loading
- **Static Files via nginx** (high-performance, cached):
  - Thumbnails: `/media/thumbnails/{filename}`
  - Category images: `/media/category-images/{filename}`
  - Cache headers: 1-year TTL (`max-age=31536000`)
  
- **Dynamic Content via FastAPI** (authentication, tracking):
  - Video streaming: `/api/videos/{id}/stream`
  - View count tracking
  - Access control

#### nginx Configuration

- **Development** (`nginx/nginx.conf`):
  - Vite HMR support via WebSocket
  - Proxy to backend and frontend services
  - Static file serving for media

- **Production** (`nginx/nginx.prod.conf`):
  - Gzip compression
  - Security headers (X-Frame-Options, X-Content-Type-Options, X-XSS-Protection)
  - Optimized file serving (`sendfile`, `tcp_nopush`)
  - Frontend served as static files from multi-stage build

#### Code Changes for nginx Optimization

- **Backend**:
  - `backend/app/api/categories.py` - Return nginx URLs for category images
  
- **Frontend** (7 files modified):
  - `frontend/src/api/videos.ts` - Use `/media/thumbnails/` paths
  - `frontend/src/api/categories.ts` - Use `/media/category-images/` paths
  - Updated all route components to pass filenames instead of IDs

#### Documentation

- **`DEPLOYMENT.md`** (617 lines):
  - Complete deployment guide
  - Quick start instructions
  - External drive setup (bind mounts)
  - Configuration options
  - Troubleshooting section
  - Backup/restore procedures

- **`CLOUDFLARE_TUNNEL.md`** (338 lines):
  - Cloudflare Tunnel setup for external access
  - Zero Trust integration
  - Security best practices
  - DNS configuration

- **`PHASE10_COMPLETE.md`**:
  - Comprehensive testing results
  - Performance metrics
  - Architecture documentation
  - Known issues and solutions

#### Testing Results

✅ All containers start successfully  
✅ Login and authentication working  
✅ Dashboard displays 21 videos correctly  
✅ **nginx serving thumbnails verified** (Server: nginx/1.29.4)  
✅ **Cache headers confirmed** (max-age=31536000)  
✅ Navigation and routing functional  
✅ Hot reload working in development mode  
✅ Health checks passing  

#### Configuration

- **Environment Variables**:
  - `VITE_API_BASE_URL` - API endpoint configuration
  - Docker-specific paths (`/data/...`)
  - CORS configuration for external access

- **Port Mappings**:
  - Development: nginx on 8080, backend on 8000, frontend on 5173
  - Production: Only nginx on 80

#### Features

- ✅ Development and production environments
- ✅ Hot reload support (development)
- ✅ Health checks for monitoring
- ✅ Log rotation (production)
- ✅ Auto-restart on failures
- ✅ External drive support
- ✅ Persistent data storage

---

### Added - Phase 9: Playlist Feature (COMPLETE ✅)

**Completion Date**: December 18, 2024  
**Total Time**: ~12-14 hours (across 3 sessions)  
**Status**: Production-ready

#### Route Restructuring (Session 3 - Dec 18, 2024)

**Issue**: Playlist detail pages wouldn't render when clicking playlist cards. URL changed but page content remained on profile page.

**Root Cause**: Parent route `profile.$username.tsx` didn't use `<Outlet />`, preventing child routes from rendering.

**Solution**: Restructured routes using layout pattern with conditional header rendering.

**Files Changed**:
- **Created**: `frontend/src/routes/_auth/profile.$username.index.tsx` (~200 lines)
  - Index route for profile tabs (Videos | Playlists)
  - Contains VideoCard component
  - Contains MyProfileDialog component
  - Manages video pagination state
  - Gets profileUser from layout context via `Route.useRouteContext()`

- **Modified**: `frontend/src/routes/_auth/profile.$username.tsx` (~170 lines)
  - Converted to layout component
  - Conditional header rendering based on route path
  - Shows header for index page, hides for playlist pages
  - Provides user context to child routes via `<Outlet context={{...}} />`
  - Manages MyProfileDialog state
  - Fetches user data once, shared with children

- **Unchanged**: `frontend/src/routes/_auth/profile.$username.playlist.$id.tsx`
  - Already correctly implemented
  - Now renders properly via parent's `<Outlet />`

**Route Structure**:
```
/_auth/profile/$username              → Layout (conditional header)
  /_auth/profile/$username/index      → Index (tabs)
  /_auth/profile/$username/playlist/$id → Detail (no header)
```

**Layout Behavior**:
- Index route (`/profile/username`): Profile header + tabs visible
- Playlist route (`/profile/username/playlist/id`): NO header, just playlist content
- Profile header includes: avatar, username, video count, "My Profile" button
- Completely separate playlist pages as requested

#### Backend API (Sessions 1-2 - COMPLETE)
- **Playlist Schemas** (`app/schemas/playlist.py`):
  - `PlaylistCreate` - Create playlist request
  - `PlaylistUpdate` - Update playlist request
  - `PlaylistVideoAdd` - Add video to playlist
  - `PlaylistReorderRequest` - Reorder videos in playlist
  - `PlaylistResponse` - Playlist with metadata
  - `PlaylistWithVideosResponse` - Playlist with full video details
  - `PlaylistListResponse` - List of playlists

- **Playlist API Endpoints** (`app/api/playlists.py`):
  - `GET /api/playlists/by-user/{username}` - Get user's playlists
  - `POST /api/playlists/` - Create new playlist
  - `GET /api/playlists/{id}` - Get playlist with videos
  - `PATCH /api/playlists/{id}` - Update playlist metadata
  - `DELETE /api/playlists/{id}` - Delete playlist
  - `POST /api/playlists/{id}/videos` - Add video to playlist
  - `DELETE /api/playlists/{id}/videos/{video_id}` - Remove video
  - `PATCH /api/playlists/{id}/reorder` - Reorder videos
  - `GET /api/playlists/videos/{video_id}/playlists` - Get playlists containing video

- **Permission Model**:
  - All playlists are public (no private/public toggle)
  - Only playlist creator can edit/add/remove/reorder
  - Admins can delete any playlist
  - All authenticated users can view all playlists

#### Testing (Session 3 - COMPLETE)

**Playwright Testing - Standard Scope**:
- ✅ Full test suite completed (30+ verification points)
- ✅ **Routing fix verified**: Playlist detail pages render correctly
- ✅ Profile header visibility: Shown on index, hidden on playlist pages
- ✅ Add videos: Multi-select with search and category filter
- ✅ Drag-drop reordering: Mouse drag working, position numbers update
- ✅ Edit playlist: Name and description updated successfully
- ✅ Remove video: Optimistic update with position recalculation
- ✅ Navigation flow: Profile ↔ playlist detail transitions work
- ✅ Permission boundaries: Owner controls visible/hidden correctly
- ✅ Toast notifications: All operations show success messages
- ✅ No console errors during testing

**Screenshots Captured** (4):
1. `02-playlist-with-videos.png` - Playlist with 4 videos and drag handles
2. `03-playlist-reordered.png` - After drag-drop showing new order
3. `04-edit-playlist-dialog.png` - Edit form with character counter
4. `01-playlist-detail-page.png` - Dashboard context

**Test Results**: ALL PASSED ✅

#### Frontend (Sessions 1-2 - COMPLETE)
- **UI Components**:
  - Added shadcn/ui Tabs component
  - Created playlist API client (`api/playlists.ts`)
  - Updated TypeScript types for playlists
  - Profile page tabs integration (Videos | Playlists)
  - Playlist card components with gradient fallbacks
  - Playlist detail page with drag-and-drop reordering (@dnd-kit)
  - Add videos dialog (search + category filter + multi-select)
  - Quick add to playlist from video cards (all pages)
  - Edit playlist dialog with form validation
  - Create playlist dialog
  - Draggable playlist videos component (keyboard + touch support)
  - Add to playlist dialog with smart pre-selection

#### Summary

**Phase 9 Complete** - Full playlist management system with:
- ✅ 9 REST API endpoints for CRUD operations
- ✅ Drag-and-drop reordering (@dnd-kit)
- ✅ Multi-select video addition with search/filters
- ✅ Profile integration with tabs
- ✅ Permission-based access control
- ✅ Layout pattern routing (playlist pages separate from profile)
- ✅ Optimistic updates for instant feedback
- ✅ Full test coverage with Playwright
- ✅ Production-ready

**Total Lines of Code**: ~2,100 (backend + frontend)
**Files Created/Modified**: 15+
**Test Coverage**: 30+ verification points
**Screenshots**: 4 documented

---

### Added - Phase 8: Twitch-Style Categories (COMPLETE)

#### Database Schema
- **Category Enhancements**:
  - Added `description` field (Text, nullable, max 500 chars)
  - Added `image_filename` field (String, nullable)
  - Added `updated_at` field (DateTime, auto-updating)

- **Playlist Feature Schema** (for future implementation):
  - Created `playlists` table (id, name, description, created_by, is_public, timestamps)
  - Created `playlist_videos` junction table (many-to-many with custom ordering)
  - Foreign keys and indexes configured
  - Unique constraint prevents duplicate videos in playlists

#### Backend Services
- **Image Processor Service** (`app/services/image_processor.py`):
  - `resize_and_convert_image()` - Resize to 400x400 square, convert to WebP
  - `validate_image_file()` - Validate type and size (max 5MB)
  - Maintains aspect ratio, centers on white canvas
  - WebP quality: 85 for optimal compression

- **Storage Service Updates**:
  - `save_category_image()` - Complete upload pipeline with temp file handling
  - `delete_category_image()` - Remove image files
  - `get_category_image_path()` - Path resolution
  - Added category-images directory creation

- **Configuration**:
  - `CATEGORY_IMAGE_STORAGE_PATH` - Storage location
  - `MAX_CATEGORY_IMAGE_SIZE_BYTES` - 5MB limit
  - `CATEGORY_IMAGE_SIZE` - 400x400 dimensions

#### Backend API Endpoints
- **New Endpoints**:
  - `POST /api/categories/{id}/image` - Upload category image (admin only)
  - `GET /api/categories/{id}/image` - Serve image (public, 1-year cache)
  - `DELETE /api/categories/{id}/image` - Delete image (admin only)
  - `GET /api/categories/slug/{slug}` - Get category by slug (clean URLs)

- **Enhanced Endpoints**:
  - `GET /api/categories/` - Now includes descriptions and image_url
  - `GET /api/categories/{id}` - Includes all new fields
  - `POST /api/categories/` - Accepts description field
  - `PATCH /api/categories/{id}` - Can update name and/or description
  - `DELETE /api/categories/{id}` - Deletes associated image file

#### Database Migration
- **Migration**: `836125dd1697_add_category_images_and_playlists`
- Successfully applied with all tables and indexes

#### Testing
- ✅ All endpoints tested with curl
- ✅ Image upload: JPG → WebP conversion verified (600x600 → 400x400)
- ✅ Image serving: Cache headers confirmed
- ✅ Slug lookup: Clean URLs working
- ✅ Description updates: Working with timestamp updates
- ✅ Image deletion: File cleanup verified

#### Dependencies
- Added Pillow==12.0.0 for image processing

#### Frontend Implementation

- **TypeScript Types**:
  - Updated `Category` interface with `description`, `image_filename`, `image_url`, `updated_at`
  - Created `Playlist` types for future Phase 9 implementation
  - Updated `CategoryCreate` and `CategoryUpdate` schemas

- **API Client Functions** (`frontend/src/api/categories.ts`):
  - `getCategoryBySlug(slug)` - Fetch category by slug for clean URLs
  - `uploadCategoryImage(id, file)` - Multipart form upload with validation
  - `deleteCategoryImage(id)` - Remove category images
  - `getCategoryImageUrl(id)` - Helper function for image URL construction

- **Admin UI Enhancements** (`frontend/src/routes/_auth/admin.categories.tsx`):
  - Added description textarea (500 char max) in create/edit dialogs
  - Image upload section with:
    - Drag-and-drop style upload button
    - Image preview (128x128px)
    - Delete button for existing images
    - File validation (5MB max, image types only)
    - Loading states for upload/delete operations
  - Updated categories table with thumbnail preview column
  - Image placeholder icons for categories without images
  - Enhanced form state management with React Query mutations

- **CategoryCard Component** (`frontend/src/components/shared/CategoryCard.tsx`):
  - Reusable square card component for Twitch-style layout
  - Display category image or gradient fallback (8 vibrant options)
  - Consistent gradient assignment based on category name
  - Video count badge with play icon (bottom-right corner)
  - Category name and description display
  - Hover effects (scale, shadow, overlay)
  - Links to `/categories/{slug}`

- **Category Browse Page** (`frontend/src/routes/_auth/categories.index.tsx`):
  - Responsive grid layout (1-4 columns based on screen size)
  - Search functionality (filters by name or description)
  - Sort options:
    - Alphabetical (A-Z)
    - Most Videos (highest to lowest count)
  - Page header with category count
  - Empty states:
    - No categories in database
    - No search results
  - Loading skeletons (8 cards with pulse animation)

- **Individual Category Page** (`frontend/src/routes/_auth/categories.$slug.tsx`):
  - Category header banner:
    - 128x128 category image or gradient
    - Large category name (h1)
    - Full description display
    - Video count badge
  - "Back to Categories" navigation button
  - Videos grid filtered by category
  - Search within category (by video title)
  - Sort options:
    - Newest (default, by upload date)
    - Most Viewed (by view count)
  - Empty states:
    - No videos in category
    - No search results
    - Category not found (404 page)
  - Loading states with skeletons
  - Reused VideoCard component from dashboard

- **Navigation Integration** (`frontend/src/components/layout/Navbar.tsx`):
  - Added "Categories" link between "Home" and "Upload"
  - Updated mobile menu with FolderOpen icon
  - Consistent styling with other nav items

#### Testing
- ✅ End-to-end Playwright testing:
  - Admin category creation with description
  - Image upload to Gaming category (JPG → WebP)
  - Category browse page (search, sort)
  - Individual category pages (Gaming, Tutorials)
  - Navigation flow (browse → category → back)
  - Search functionality on both pages
  - Gradient fallbacks for categories without images
- ✅ All features working across desktop and mobile viewports

#### User Experience Improvements
- Clean URLs using slugs (`/categories/gaming` instead of UUIDs)
- Visual polish with gradient fallbacks (no broken image placeholders)
- Seamless navigation between browse and individual pages
- Consistent card-based design language
- Search and sort on both browse and category pages
- Loading states prevent layout shift

---

## [Previous Releases] - 2025-12-18

### Added - Phase 5: Social Platform Transformation

#### Backend
- **New Endpoint**: `GET /api/users/by-username/{username}` for username-based user lookup
  - Returns `UserWithQuota` when viewing own profile
  - Returns `UserProfile` (public data only) when viewing others
  - Case-insensitive username matching
  - Proper 404 handling for non-existent users

#### Frontend - Core Features
- **Community Home Feed** (`/dashboard`)
  - Displays all videos from all community members
  - Default sort: Newest first (by upload date)
  - Added "Most Viewed" sorting option
  - Integrated search bar and category filter
  - Shows "{count} videos from the community" instead of personal stats
  - Replaced personal dashboard with community-first experience

- **Instagram-Style User Profiles** (`/profile/:username`)
  - Dynamic profile pages accessible for all users
  - Profile header with avatar (generated from initials), username, video count
  - Grid display of user's uploaded videos
  - "My Profile" button (visible only when viewing own profile)
  - "My Profile" dialog containing:
    - Upload quota card (usage, progress bar, reset info)
    - Account information card (email, role, member since, status)
  - Proper video visibility:
    - Own profile: Shows all videos (any status)
    - Other profiles: Shows only completed videos

- **Route Structure Updates**
  - Created `/profile/:username` dynamic route
  - Old `/profile` route now redirects to `/profile/:username`
  - Deleted `/videos` route (functionality moved to dashboard)
  - Profile route uses Outlet pattern for child routes

#### Frontend - API Integration
- Added `getUserByUsername(username)` function in `api/users.ts`
- Added `getAdminStats()` function for future admin dashboard
  - Client-side aggregation of users, videos, and storage stats
  - Supports up to 500 users and 1000 videos (configurable limits)

#### Frontend - Shared Components
- Reused existing shared components:
  - `EmptyState` - Consistent empty state messaging
  - `PageHeader` - Standardized page headers
  - `VideoCardSkeleton` - Loading skeletons
  - `LoadingSpinner` - Loading indicators

### Changed
- **Dashboard page** completely rewritten as community video feed
- **Profile page** transformed from static account page to dynamic user profiles
- **Navigation philosophy**: Shifted from "personal dashboard + browse" to "community feed + profiles"
- **Personal stats** moved from dashboard to "My Profile" dialog (accessible from own profile only)

### Removed
- Personal stats cards from dashboard (videos uploaded, total views, storage used, upload quota)
- "Quick Actions" card from dashboard
- "Recent Uploads" section from dashboard
- `/videos` route and page (replaced by dashboard home feed)

### Technical Details
- Video sorting implemented client-side (no backend changes required)
- Username normalization to lowercase for consistent lookups
- Profile avatar generates initials from username (e.g., "alice" → "A", "john_doe" → "JD")
- Proper React Query cache management for user and video data
- TypeScript strict mode compliance throughout

---

## [Phase 6] - 2025-12-18 - Navigation & Social Links

### Added
- **Clickable Usernames** throughout the application
  - Dashboard video cards: usernames link to user profiles
  - Video player metadata: uploader username links to profile
  - Hover effect: color changes to primary theme color
  - Consistent behavior across all pages

### Changed
- **Navbar Updates**
  - Renamed "Dashboard" → "Home" for clearer semantics
  - Removed "Videos" link (functionality merged into Home)
  - Profile dropdown link now uses dynamic route `/profile/$username`
  
- **Upload Flow Improvement**
  - After successful upload, redirects to user's profile page
  - Users can immediately see their newly uploaded video
  
- **Fixed Broken Routes** (after `/videos` route removal)
  - Video player delete action redirects to `/dashboard` (was `/videos`)
  - Category badge links redirect to `/dashboard?category_id=...` (was `/videos?...`)
  - "Not found" page redirects to `/dashboard` (was `/videos`)
  - Removed "Back to Videos" button from video player page

### Technical Details
- All navigation tested with Playwright
- No broken links or 404 errors
- Consistent user experience across all pages

---

## [Phase 7] - 2025-12-18 - Admin Dashboard

### Added
- **Admin Dashboard** (`/admin/index`)
  - System overview page with comprehensive statistics
  - Real-time data from API endpoints
  
- **Key Statistics Cards** (4 metrics)
  - Total Users: Count of registered accounts
  - Total Videos: Count with completion percentage
  - Storage Used: Total disk space formatted (GB/MB)
  - Processing Queue: Videos currently processing or pending
  
- **Video Processing Status Breakdown**
  - Completed: Green checkmark icon with count
  - Processing: Blue spinner icon with count
  - Pending: Yellow clock icon with count
  - Failed: Red X icon with count
  - Color-coded visual indicators for quick status assessment
  
- **Recent Activity Feed**
  - Shows last 10 uploaded videos
  - Clickable video titles (navigate to video player)
  - Clickable usernames (navigate to user profiles)
  - Displays: upload time, file size, status badge
  - Color-coded status badges (completed/processing/failed/pending)
  - Loading state with spinner
  - Empty state handling

### Fixed
- **API Integration Bug**
  - Updated `getAdminStats()` to use correct pagination parameters
  - Changed from `page` & `page_size` to `skip` & `limit`
  - Resolved 422 Unprocessable Content errors
  - Admin dashboard now loads successfully

### Technical Details
- Client-side aggregation of user and video statistics
- React Query for efficient data fetching and caching
- TypeScript strict mode compliance
- Reused shared components (PageHeader, LoadingSpinner, Badge)
- Admin-only route protection (non-admins redirected to dashboard)

---

## [Planned - Phase 8]
- System configuration management UI
- Mobile navigation improvements (hamburger menu, drawer)
- Additional end-to-end tests
- Docker deployment configuration
- Production optimizations

---

## Previous Releases

### [Phase 4] - Video Streaming & Display
- Videos API with filtering, pagination, and search
- HTML5 video player with byte-range streaming
- Thumbnail generation and serving
- View count tracking
- Video metadata management (edit title, description, category)

### [Phase 3] - Video Upload & Processing
- FFmpeg-based video processing (validation, transcoding, thumbnails)
- Upload quota management (weekly limits, reset mechanism)
- Background task processing
- Drag-and-drop upload interface
- Real-time upload progress tracking

### [Phase 2] - Category Management
- Category CRUD API endpoints
- Admin category management UI
- Automatic slug generation
- Video count aggregation per category

### [Phase 1] - Backend Database Models
- SQLAlchemy models (User, Video, Category, Invitation, Config)
- Alembic database migrations
- Upload quota tracking fields
- Database seeding script with test data

### [Phase 0] - Foundation
- User authentication (JWT-based login/register)
- Admin panel with sidebar navigation
- Invitation system for user registration
- Dark mode toggle with persistence
- Protected routes and role-based access control

# Changelog

All notable changes to Clipset will be documented in this file.

## [Unreleased] - 2025-12-18

### Added - Phase 8: Twitch-Style Categories (Backend Complete)

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

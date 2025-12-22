# Clipset Project Specification

## Concept
Private, self-hostable video sharing platform for small communities. A cross between YouTube, Instagram, TikTok, and a subreddit community - without file size limits or compression.

## Platform Philosophy
Clipset is a **community-first social video platform**, not a file storage service. The focus is on:
- **Community feed**: Home page shows all videos from all users (like Reddit/Instagram)
- **User profiles**: Instagram-style profiles showing each user's uploaded videos
- **Social discovery**: Browse by user, search videos, filter by category
- **Small community scale**: Optimized for friends, family, or small groups (not thousands of users)

## Problem & Solution
Social media platforms compress videos or impose file size limits. Clipset provides a self-hostable alternative deployable via Docker with configurable storage (external drives supported).

## Access Model
- Cloudflare Tunnel for secure external access
- Invitation-only registration via admin-generated email-linked tokens
- Role-based permissions (admin/user)

## MVP Features

### Phase 0: Foundation (✅ Completed)
- User authentication (JWT-based)
- Admin panel with sidebar navigation
- User invitation system (create, view, revoke)
- Dark mode toggle
- Responsive UI
- Database seeding script

### Phase 1: Backend Database Models (✅ Completed)
- Category model with slug generation
- Video model with processing status tracking (pending/processing/completed/failed)
- Config model for runtime settings
- Database migrations with Alembic
- Upload quota tracking (weekly limits per user)
- Foreign key relationships and indexes
- Enhanced seed script with 6 categories and 20 sample videos

### Phase 2: Category Management (✅ Completed)
**Backend:**
- Category API endpoints (GET, POST, PATCH, DELETE)
- Automatic slug generation from category names
- Unique slug enforcement with counter appending
- Video count aggregation using SQL joins
- Admin-only write permissions
- UUID to string conversion for SQLite compatibility

**Frontend:**
- TypeScript types for Category entities
- API client functions for all CRUD operations
- Admin categories page with table view
- Create/Edit dialogs with form validation
- Delete confirmation with video count warnings
- Real-time updates via React Query
- Toast notifications for all operations
- Integrated into admin sidebar navigation

**Testing:**
- End-to-end Playwright tests covering full CRUD workflow
- Manual API testing via curl and Swagger UI
- Verified with seeded database (6 categories, 20 videos)

### Phase 3: Video Upload & Processing (✅ Completed)
**Backend:**
- Storage service (file save/move/delete operations, unique filename generation, temp cleanup)
- Video processor (FFmpeg validation, transcoding to 1080p H264, thumbnail extraction, metadata extraction)
- Upload quota service (check/increment/reset, quota info)
- Background task processing (async video processing)
- Video upload API (multipart form with background processing, validation, quota checking)

**Frontend:**
- Video upload page with drag-and-drop interface
- Upload progress tracking
- File validation (type, size)
- Quota display with usage percentage
- Category selection during upload
- Form validation and error handling

### Phase 4: Video Streaming & Display (✅ Completed)
**Backend:**
- Videos API (list with filtering/pagination/search, get, update, delete)
- Video streaming endpoint with byte-range support
- Thumbnail serving endpoint
- View count tracking
- Access control (users see COMPLETED videos + their own in any status)
- Admin quota reset endpoint

**Frontend:**
- Video listing page with search and category filters
- Video player page with HTML5 player
- Thumbnail display in video cards
- Processing status badges and polling
- Edit/delete actions for video owners/admins
- View count display
- Related videos sidebar (placeholder)

### Phase 5: UI/UX Refinement & Social Features (✅ Completed)

**Completed:**
- ✅ **Community-First Redesign:**
  - Transformed `/dashboard` from personal stats to community video feed
  - Shows all videos from all users (Instagram/TikTok/Reddit-style)
  - Default sort: Newest first (by upload date)
  - Added "Most Viewed" sorting option (client-side)
  - Integrated search and category filters from old videos page
  - Clean "Home" branding instead of "Welcome back, user"

- ✅ **Instagram-Style User Profiles:**
  - Dynamic route: `/profile/:username` for all users
  - Profile header with avatar (user initials), username, video count
  - Grid of user's uploaded videos
  - "My Profile" button (only visible on own profile)
  - "My Profile" dialog with quota info and account details
  - Consistent experience: own profile vs. viewing others
  - Proper visibility rules (all videos for own profile, only completed for others)

- ✅ **Backend Enhancements:**
  - New endpoint: `GET /api/users/by-username/{username}`
  - Returns full UserWithQuota for own profile
  - Returns public UserProfile for other users
  - Case-insensitive username lookup
  - Proper 404 handling for non-existent users

- ✅ **Frontend API Integration:**
  - `getUserByUsername()` function in users.ts
  - `getAdminStats()` function for future admin dashboard
  - Aggregates users, videos, and storage stats client-side

- ✅ **Shared Components:**
  - EmptyState component for consistent empty states
  - PageHeader component for standardized page headers
  - VideoCardSkeleton and LoadingSpinner components
  - LoadingPage component for full-page loading

- ✅ **Route Cleanup:**
  - Deleted `/videos` route (logic moved to `/dashboard`)
  - Old `/profile` redirects to `/profile/:username`
  - Profile route structure uses Outlet for child routes

**Architecture Changes:**
- Shifted from "personal dashboard + browse videos" to "community feed + user profiles"
- Removed personal stats from home page (now in "My Profile" dialog)
- Made usernames the primary navigation element (pending clickable links)

### Phase 6: Navigation & Social Links (✅ Completed)

**Completed:**
- ✅ Updated Navbar: "Dashboard" → "Home", removed "Videos" link
- ✅ Clickable usernames throughout app
- ✅ Profile dropdown uses dynamic routes
- ✅ Fixed all broken /videos references
- ✅ Upload success redirects to user profile

**Testing:**
- ✅ End-to-end navigation flow tested
- ✅ All username links verified
- ⏳ Mobile responsiveness (pending)

### Phase 7: Admin Dashboard (✅ Completed)

**Backend:**
- Client-side aggregation using existing endpoints
- Stats display: users, videos, storage, processing queue

**Frontend:**
- `/admin/` index page with stats dashboard
- Recent activity feed with clickable links
- Video processing status breakdown with visual indicators

### ✅ Phase 8: Twitch-Style Categories (Completed)

**Backend:**
- Category model enhanced with `description`, `image_filename`, `updated_at`
- Playlist models created (`playlists`, `playlist_videos` tables)
- Image processor service (resize to 400x400, convert to WebP)
- Storage service with category image functions
- API endpoints:
  - `POST /api/categories/{id}/image` - Upload image
  - `GET /api/categories/{id}/image` - Serve image (cached)
  - `DELETE /api/categories/{id}/image` - Delete image
  - `GET /api/categories/slug/{slug}` - Get by slug
- All existing endpoints updated with image_url and descriptions

**Frontend:**
- Updated TypeScript types with new category fields
- API client functions (getCategoryBySlug, uploadCategoryImage, deleteCategoryImage)
- Admin categories page with image upload UI and description field
- Category browse page (`/categories`) with search and sort
- Individual category pages (`/categories/{slug}`) with filtered videos
- CategoryCard component with gradient fallbacks
- Navigation updated (Home | Categories | Upload)
- Full Playwright testing completed

### ✅ Phase 9: Playlist Feature (Complete)

**Architecture:**
- All playlists are public (no private/public toggle)
- Playlists live on user profiles (`/profile/{username}` with tabs)
- User flow: Profile → Playlists Tab → Create/Open Playlist → Add Videos Dialog
- Layout pattern: Index page shows profile header, playlist detail pages are completely separate

**Backend (✅ 100% COMPLETE):**
- Playlist database schema (from Phase 8)
- 9 REST API endpoints for full CRUD operations
- Permission model: creator can edit, anyone can view
- Position-based video ordering with atomic reordering
- Automatic position management on add/remove

**Frontend (✅ 100% COMPLETE):**
- ✅ Tabs component integration
- ✅ TypeScript types and API client
- ✅ Profile page tabs (Videos | Playlists)
- ✅ Playlist cards with cover images and gradient fallbacks
- ✅ Playlist detail page component fully implemented
- ✅ Drag-and-drop video reordering (@dnd-kit with keyboard/touch support)
- ✅ "Add Videos" dialog (search + category filter + multi-select checkboxes)
- ✅ Quick "Add to Playlist" from video cards (all pages: dashboard, categories, profiles, video player)
- ✅ Create/Edit playlist dialogs with validation
- ✅ Remove videos with optimistic updates
- ✅ **Routing FIXED**: Layout pattern with conditional header rendering

**Route Restructuring Completed:**
- [x] Created `profile.$username.index.tsx` for tabs view (~200 lines)
- [x] Converted `profile.$username.tsx` to layout component (~170 lines)
- [x] Implemented conditional header rendering (hidden on playlist pages)
- [x] Tested complete playlist workflow end-to-end (30+ verification points)
- [x] Captured 4 screenshots documenting all major features

**Testing (✅ COMPLETE):**
- ✅ Create playlist workflow
- ✅ Add to playlist from 4 different pages
- ✅ Pre-selection of playlists containing video
- ✅ Toast notifications
- ✅ Button visibility and interactions
- ✅ Playlist detail page navigation (ROUTING FIX VERIFIED!)
- ✅ Full CRUD workflow on playlist detail page
- ✅ Drag-drop reordering (mouse + keyboard)
- ✅ Permission boundaries tested
- ✅ Optimistic updates working
- ✅ Navigation flows confirmed

**Total Time**: ~12-14 hours across 3 sessions

### ✅ Phase 10: Docker Deployment & nginx Optimization (Complete)
**Goal**: Make Clipset production-ready for self-hosting with performance optimization

**Completed** (December 18-23, 2024):
- ✅ Docker Compose configurations (development + production)
- ✅ Nginx reverse proxy with **hybrid static file serving**
- ✅ **Performance optimization**: 50-67% faster thumbnail loading
- ✅ nginx serves thumbnails/category images (1-year cache)
- ✅ FastAPI serves videos (authentication + view tracking)
- ✅ External drive support via bind mounts
- ✅ Cloudflare Tunnel integration for `clips.7ito.com`
- ✅ Production environment configuration on Razer Blade 14
- ✅ Chunked upload support to bypass Cloudflare 100MB limit
- ✅ Health checks and auto-restart
- ✅ Log rotation (10MB max, 3 files)
- ✅ Comprehensive deployment documentation
- ✅ Tested and verified with Playwright

**Key Achievement**: nginx static file serving provides significant performance boost while maintaining security for video streaming.

### ✅ Phase 11: Admin Configuration UI (Complete)
**Goal**: Allow admins to manage system settings via web UI

**Completed** (December 19-22, 2024):
- ✅ Config API endpoints (GET, PATCH) with admin-only access
- ✅ Pydantic schemas with validation (1MB-10GB for files, 1MB-100GB for quotas)
- ✅ FileSizeInput component with MB/GB unit conversion
- ✅ PathInput component for storage paths
- ✅ Admin settings page with form state management
- ✅ Upload quota service reads from database config
- ✅ Unsaved changes tracking and reset functionality
- ✅ Toast notifications for success/error states
- ✅ Settings link in admin sidebar
- ✅ **Dynamic Video Storage Path Integration**:
    - Backend resolution of per-video storage paths
    - Database migration adding `storage_path` to `Video` model
    - Writable path validation in Admin UI
    - Background task support for dynamic output directories

**Key Achievement**: Full runtime configuration management. Admins can adjust upload limits and storage locations through an intuitive web interface, with per-video path tracking ensuring long-term data integrity.

### ✅ Phase 12: User Directory & Management (Complete)
**Goal**: Community discovery and administrative user management

**Backend**:
- Enhanced User API with aggregated video and playlist counts
- New `GET /api/users/directory` endpoint for public listing with search/sort
- New `POST /api/users/{id}/activate` endpoint for admin re-activation
- Optimized queries using SQL subqueries for performance

**Frontend**:
- ✅ **User Directory (`/users`)**:
  - Responsive grid of community members
  - Large initials-based avatars with dynamic gradients
  - Search by username
  - Sort by: Newest, Alphabetical, Most Videos, Most Playlists
- ✅ **Admin User Management (`/admin/users`)**:
  - Detailed table with Email, Role, Joined Date, and Stats
  - Real-time activation/deactivation toggle
  - Status badges and admin role indicators
- ✅ **Shared Components**:
  - `UserAvatar`: Reusable initials/gradient avatar system
  - `UserCard`: Visually polished member cards with engagement stats
- ✅ **Navigation**:
  - Unified links in main Navbar and Admin sidebar

### ✅ Phase 13: User Profile Customization & Password Recovery (Complete)
**Goal**: Allow users to customize their profiles with avatars and recover access via password reset.

**Backend**:
- **Custom Avatars**:
  - Added `avatar_filename` to `User` model with Alembic migration.
  - Storage service for avatar processing (resize, WebP conversion).
  - API endpoints for avatar upload (`POST /api/users/me/avatar`) and deletion.
  - Nginx configuration for high-performance static avatar serving.
- **Password Reset**:
  - `PasswordResetToken` model for secure, time-limited recovery tokens.
  - Console-log fallback for reset links (perfect for self-hosted "manual" delivery).
  - API endpoints for request (`POST /api/auth/forgot-password`) and reset.

**Frontend**:
- **Avatar Management**:
  - Redesigned "My Profile" dialog with avatar upload/preview/remove.
  - Updated `UserAvatar` component to support custom images with robust fallbacks.
  - Integrated avatars into Directory, Admin, and Profile headers.
- **Password Reset Flow**:
  - New `/forgot-password` and `/reset-password` routes.
  - Validation schemas and API client integration.
  - "Forgot password?" link added to Login page.

**Key Achievement**: Enhanced user identity with custom avatars and provided a secure, self-host-friendly way to recover forgotten passwords without mandatory SMTP configuration.

### ✅ Phase 14: iOS HEVC Support (Complete)
**Goal**: Support high-quality video uploads from iOS devices using HEVC/H.265 format.

**Backend**:
- Added `hevc` and `h265` to accepted video formats.
- Enhanced video processor to detect 10-bit color depth (common in iOS HDR/HEVC).
- Updated transcoding pipeline to force `yuv420p` (8-bit) pixel format for maximum web compatibility.
- Ensures HDR/10-bit sources are correctly converted to 8-bit H.264 without playback issues in browsers.

**Frontend**:
- Updated upload validation to accept `.hevc` and `.h265` files.
- Improved error messaging for unsupported formats.

### Future Enhancements (Post-MVP)
- Advanced search and filtering
- Comments and social interactions
- Video sharing with external links
- Analytics dashboard and storage monitoring
- PostgreSQL migration option
- Live streaming support

## Recent Architectural Changes (Phase 5)

### From Personal Dashboard → Community Feed
**Before:** Users logged in to see their own stats, recent uploads, and a separate "Videos" page to browse community content.

**After:** Users land on a community-first home feed showing all videos from all users, sorted by newest or most viewed. Personal stats moved to "My Profile" dialog.

**Impact:**
- More engaging landing experience
- Immediate content discovery
- Aligns with social platform philosophy
- Reduced navigation depth (one less click to see content)

### From Static Profile → Instagram-Style Profiles
**Before:** `/profile` showed own account info and quota in a static page.

**After:** `/profile/:username` shows any user's profile with their uploaded videos. Own profile has special "My Profile" button for accessing quota/account info.

**Impact:**
- Social discovery via user profiles
- Shareable profile URLs
- Consistent UX whether viewing own or others' profiles
- Encourages community interaction

### Navigation Simplification (In Progress)
**Before:** Dashboard | Videos | Upload | Profile | Admin

**After:** Home | Upload | Profile | Admin

**Impact:**
- Clearer branding ("Home" vs "Dashboard")
- Removed redundant "Videos" link (home page IS the videos)
- Streamlined navigation bar

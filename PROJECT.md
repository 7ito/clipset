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

### Phase 8: Twitch-Style Categories (🚧 In Progress)

**Backend (✅ Complete):**
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
- Tested: All endpoints working correctly

**Frontend (⏳ Next):**
- Update category types with description and image fields
- Add API client functions for image upload/delete
- Update admin categories page with image upload UI
- Create category browse page (`/categories`)
- Create individual category pages (`/categories/{slug}`)
- Add CategoryCard component with image support
- Add "Categories" link to main navigation
- Test with Playwright

### Phase 9: Final Testing & Deployment (📋 Planned)
- Comprehensive end-to-end testing with Playwright
- Full navigation flow testing
- Mobile responsiveness verification
- System configuration management UI
- Docker deployment configuration
- Cloudflare Tunnel setup guide
- Production deployment documentation

### Future Enhancements
- Advanced search and filtering
- User profiles and activity
- Video sharing and permissions
- Analytics and storage monitoring

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

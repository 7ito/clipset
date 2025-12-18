# Clipset Project Specification

## Concept
Private, self-hostable video sharing platform for small communities. Think private YouTube/Instagram without file size limits or compression.

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

### Phase 5: UI/UX Refinement (🚧 In Progress)

**Completed:**
- ✅ Created shared component library:
  - EmptyState component for consistent empty states
  - PageHeader component for standardized page headers
  - VideoCardSkeleton and LoadingSpinner components
  - LoadingPage component for full-page loading
- ✅ Refined core user pages:
  - Dashboard: Enhanced stats cards, better spacing, empty states
  - Videos Index: Improved cards with hover animations, better grid, skeletons
  - Upload: Better drag-drop UI, enhanced quota display, improved progress
  - Video Player: Added back button, better loading/error states
  - Profile: Icon-based layout, 2-column grid, better hierarchy
- ✅ Improved design system:
  - Increased spacing (space-y-8 for pages, gap-6 for grids)
  - Enhanced typography scale (larger stat numbers, better hierarchy)
  - Standardized icon sizes (w-5 h-5 for headers)
  - Better hover effects and transitions
- ✅ Enhanced responsive design:
  - Mobile-first grid layouts (1 → 2 → 3 → 4 columns)
  - Touch-friendly button sizes
  - Responsive page headers
- ✅ Better user feedback:
  - Skeleton loaders for perceived performance
  - Rich empty states with icons and CTAs
  - Loading spinners with context
  - Improved error messaging

**In Progress:**
- ⏳ Mobile navigation drawer
- ⏳ Admin page refinements (categories, invitations tables)
- ⏳ Breadcrumb navigation

**Planned:**
- Toast notification redesign
- Form validation improvements
- Page transition animations
- Additional accessibility enhancements

### Phase 6-8: Advanced Features & Deployment (📋 Planned)
- User profiles showing uploaded videos
- Admin dashboard with statistics
- System configuration management UI
- Additional end-to-end tests
- Docker deployment configuration
- Cloudflare Tunnel setup guide

### Future Enhancements
- Advanced search and filtering
- User profiles and activity
- Video sharing and permissions
- Analytics and storage monitoring

## Philosophy
Clipset is a private social platform, not a file storage service. Users have accounts, upload videos, and view content from others in their community.

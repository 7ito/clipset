# Phase 9: Playlist Feature - Planning Document

**Created**: December 18, 2024  
**Status**: 📋 Planned  
**Priority**: Medium  
**Prerequisites**: ✅ Database schema complete (Phase 8.1)

---

## Overview

Implement user-created playlists for organizing and curating video collections. Users can create public or private playlists, add videos, reorder them, and share with others.

---

## Goals

### Primary Goals
1. Enable users to organize videos into custom playlists
2. Support public and private playlist visibility
3. Allow playlist sharing via clean URLs
4. Provide playlist-based video playback flow

### Secondary Goals
- Drag-and-drop video reordering
- Playlist cover image (first video thumbnail)
- "Add to Playlist" quick action on video cards
- Playlist analytics (view count, video count)

---

## Database Schema (Already Implemented)

### Tables Created in Phase 8.1

**playlists:**
```sql
- id (UUID, PK)
- name (VARCHAR, required)
- description (TEXT, nullable)
- created_by (UUID, FK → users.id)
- is_public (BOOLEAN, default: false)
- created_at (DATETIME)
- updated_at (DATETIME)
```

**playlist_videos:**
```sql
- id (UUID, PK)
- playlist_id (UUID, FK → playlists.id, ON DELETE CASCADE)
- video_id (UUID, FK → videos.id, ON DELETE CASCADE)
- position (INTEGER, for ordering)
- added_at (DATETIME)
- added_by (UUID, FK → users.id)
- UNIQUE(playlist_id, video_id) -- prevents duplicates
```

---

## Backend Implementation

### Phase 9.1: Playlist API Endpoints (5-6 hours)

#### Playlist CRUD
- `GET /api/playlists/` - List user's playlists (+ public playlists from others)
- `POST /api/playlists/` - Create playlist
- `GET /api/playlists/{id}` - Get playlist details with videos
- `PATCH /api/playlists/{id}` - Update playlist (name, description, visibility)
- `DELETE /api/playlists/{id}` - Delete playlist

#### Playlist Video Management
- `POST /api/playlists/{id}/videos` - Add video to playlist
- `DELETE /api/playlists/{id}/videos/{video_id}` - Remove video from playlist
- `PATCH /api/playlists/{id}/videos/reorder` - Update video positions

#### Additional Endpoints
- `GET /api/playlists/slug/{slug}` - Get by slug (for shareable URLs)
- `GET /api/videos/{id}/playlists` - Get playlists containing a specific video

#### Schemas (Pydantic)
```python
# Request Schemas
PlaylistCreate(name, description?, is_public?)
PlaylistUpdate(name?, description?, is_public?)
PlaylistVideoAdd(video_id, position?)
PlaylistReorder(video_positions: List[{video_id, position}])

# Response Schemas
PlaylistResponse(id, name, description, is_public, created_by, created_at, updated_at, video_count)
PlaylistWithVideos(extends PlaylistResponse + videos: List[PlaylistVideoResponse])
PlaylistVideoResponse(id, playlist_id, video_id, position, added_at, video: VideoResponse)
```

#### Permissions
- Users can CRUD their own playlists
- Users can view public playlists from others
- Only playlist owner can add/remove/reorder videos
- Admins can delete any playlist

---

## Frontend Implementation

### Phase 9.2: Playlist UI Components (8-10 hours)

#### 1. Playlist Management Page (`/playlists`)
- Grid of user's playlists (similar to categories page)
- Create new playlist button
- Playlist cards showing:
  - Cover image (first video thumbnail or placeholder)
  - Playlist name
  - Video count
  - Public/private badge
  - Link to playlist page

#### 2. Individual Playlist Page (`/playlists/{id}`)
- Playlist header:
  - Cover image
  - Name and description
  - Public/private toggle (owner only)
  - Edit/Delete buttons (owner only)
  - Share button (copy link)
- Videos list (reorderable for owner):
  - Drag-and-drop reordering
  - Remove button (owner only)
  - Play all button
  - Video cards with position numbers
- Empty state: "No videos in playlist"

#### 3. "Add to Playlist" Feature
- Button on video cards
- Modal with:
  - List of user's playlists (checkboxes)
  - Create new playlist option
  - Save button
- Success toast on add

#### 4. Playlist Card Component
```tsx
<PlaylistCard>
  - Cover image (first video or placeholder)
  - Name
  - Video count badge
  - Public/private badge
  - Link to playlist page
  - Hover effects
</PlaylistCard>
```

#### 5. Navigation Integration
- Add "Playlists" link to user profile dropdown
- Or add to main navbar (Home | Categories | Playlists | Upload)

---

## User Stories

### As a User, I can:
1. Create a new playlist with a name and description
2. Make a playlist public or keep it private
3. Add videos to my playlists from video cards
4. Remove videos from my playlists
5. Reorder videos in my playlists by dragging
6. View all my playlists in one place
7. View public playlists from other users
8. Share a public playlist URL with others
9. Play all videos in a playlist sequentially
10. Delete playlists I no longer need

### As a Visitor, I can:
11. View public playlists without logging in (stretch goal)
12. See playlist creator's username

---

## Implementation Phases

### Phase 9.1: Backend (5-6 hours)
- [ ] Create Pydantic schemas for playlists
- [ ] Implement playlist CRUD endpoints
- [ ] Implement playlist video management endpoints
- [ ] Add permission checks
- [ ] Test all endpoints with curl/Swagger
- [ ] Update seed script with sample playlists

### Phase 9.2: Frontend Core (6-8 hours)
- [ ] Create TypeScript types for playlists
- [ ] Create API client functions
- [ ] Build PlaylistCard component
- [ ] Build playlist browse page (`/playlists`)
- [ ] Build individual playlist page (`/playlists/{id}`)
- [ ] Add create/edit/delete dialogs

### Phase 9.3: Advanced Features (4-5 hours)
- [ ] Implement "Add to Playlist" button on video cards
- [ ] Add drag-and-drop reordering (react-beautiful-dnd or dnd-kit)
- [ ] Add playlist sharing (copy link)
- [ ] Add public/private toggle
- [ ] Add "Play All" feature (auto-advance videos)

### Phase 9.4: Testing & Polish (2-3 hours)
- [ ] Playwright tests for full playlist workflow
- [ ] Test edge cases (empty playlists, reordering, duplicates)
- [ ] Mobile responsiveness
- [ ] Loading states and error handling
- [ ] Update documentation

**Total Estimated Time**: 17-22 hours

---

## Technical Considerations

### Reordering Implementation
- Use `position` field (integer) for ordering
- On reorder, update all affected positions atomically
- Client-side: Use dnd-kit for drag-and-drop (lighter than react-beautiful-dnd)

### Performance
- Cache playlist data with React Query
- Optimistic updates for add/remove/reorder
- Lazy load video thumbnails in long playlists
- Pagination for playlists with many videos (>50)

### Edge Cases
- Handle deleted videos (show placeholder in playlist)
- Prevent duplicate videos in same playlist (DB constraint)
- Handle concurrent reordering (last write wins)
- Maximum playlist size (optional: 100 videos?)

### Security
- Ensure users can't add videos to others' playlists
- Validate public/private toggle permissions
- Sanitize playlist names and descriptions

---

## UI Mockups (Text-Based)

### Playlist Browse Page
```
┌─────────────────────────────────────────┐
│ My Playlists                 [+ Create] │
├─────────────────────────────────────────┤
│ ┌────────┐ ┌────────┐ ┌────────┐       │
│ │ [IMG]  │ │ [IMG]  │ │ [IMG]  │       │
│ │Favs    │ │Watch   │ │Gaming │       │
│ │12 vids │ │5 vids  │ │8 vids │       │
│ │🔒      │ │🔒      │ │🌐      │       │
│ └────────┘ └────────┘ └────────┘       │
└─────────────────────────────────────────┘
```

### Individual Playlist Page
```
┌─────────────────────────────────────────┐
│ ← Back to Playlists          [Edit] [X] │
├─────────────────────────────────────────┤
│ ┌────────┐ Favorites                    │
│ │ [IMG]  │ My favorite videos           │
│ │        │ 12 videos • Private          │
│ └────────┘ [▶ Play All] [Share]         │
├─────────────────────────────────────────┤
│ 1. [Video Card] ≡                       │
│ 2. [Video Card] ≡                       │
│ 3. [Video Card] ≡                       │
└─────────────────────────────────────────┘
```

---

## Success Criteria

- [ ] Users can create, edit, delete playlists
- [ ] Users can add/remove videos from playlists
- [ ] Users can reorder videos via drag-and-drop
- [ ] Public playlists are shareable via URL
- [ ] Private playlists are only visible to owner
- [ ] All playlist operations work on mobile
- [ ] No regressions in existing features
- [ ] Full Playwright test coverage

---

## Next Steps After Phase 9

### Phase 10: Final Polish & Deployment
- Docker deployment configuration
- Production environment setup
- Performance optimization
- Mobile UX improvements
- Comprehensive documentation
- User guide / help section

### Future Enhancements (Post-MVP)
- Collaborative playlists (multiple editors)
- Playlist folders/categories
- Auto-playlists (smart filters)
- Playlist comments/discussions
- Playlist analytics dashboard
- Export playlists (JSON/M3U)

---

**Status**: Ready to begin when Phase 8 is complete  
**Last Updated**: December 18, 2024

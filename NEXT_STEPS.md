# Next Steps - Clipset Development

**Last Updated**: December 18, 2024  
**Current Phase**: Phase 9 (Playlists) - 90% Complete

---

## Just Completed (This Session)

### Phase 9: Playlist Feature Implementation
**Time Spent**: 8-9 hours  
**Status**: Core functionality complete, minor polish needed

**What Was Built**:
1. ✅ EditPlaylistDialog component with form validation
2. ✅ AddVideosDialog with search, category filter, and multi-select
3. ✅ DraggablePlaylistVideos with @dnd-kit drag-drop reordering
4. ✅ AddToPlaylistDialog for quick-add from video cards
5. ✅ Remove video functionality with optimistic updates
6. ✅ "Add to Playlist" button on dashboard video cards
7. ✅ Full integration into profile pages with tabs
8. ✅ Permission system (owner-only edit/manage)

**Files Created**: 5 new components (~880 lines)  
**Dependencies Added**: @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities

**Testing**: Basic Playwright manual testing completed
- ✅ App loads successfully
- ✅ Profile tabs work (Videos | Playlists)
- ✅ Empty states display correctly
- ✅ No critical console errors

---

## Immediate Next Steps (2-3 hours)

### 1. Debug & Polish Playlist Feature
**Priority**: High  
**Time**: 1-2 hours

**Tasks**:
- [ ] Debug CreatePlaylistDialog click handler (not opening from empty state)
- [ ] Test full workflow: Create → Add Videos → Reorder → Edit → Delete
- [ ] Add "Add to Playlist" button to remaining pages:
  - [ ] `categories.$slug.tsx` (copy dashboard pattern)
  - [ ] `profile.$username.tsx` video cards
  - [ ] `videos.$id.tsx` player page
- [ ] Fix any TypeScript errors in build
- [ ] Test on mobile viewport with Playwright
- [ ] Verify drag-drop works on touch devices

### 2. Extended Playwright Testing
**Priority**: High  
**Time**: 1 hour

**Test Scenarios**:
- [ ] Create playlist with name + description
- [ ] Add 3-5 videos via search dialog
- [ ] Reorder videos with drag-drop
- [ ] Edit playlist metadata
- [ ] Remove videos (verify position auto-adjust)
- [ ] Quick-add video to multiple playlists
- [ ] Delete playlist (verify redirect)
- [ ] View another user's playlist (read-only)
- [ ] Verify permissions (can't edit others' playlists)
- [ ] Test empty states throughout
- [ ] Mobile responsive checks

**Capture Screenshots**:
- Create playlist dialog
- Add videos dialog with search
- Playlist with videos (draggable list)
- Edit playlist dialog
- Quick-add dialog

---

## Short-Term Goals (1-2 weeks)

### Phase 10: Docker Deployment (8-10 hours)
**Priority**: High - Makes app production-ready

**Implementation Plan** (from DEPLOYMENT_PLAN.md):
1. Create Docker Compose files (dev + production)
2. Set up Nginx reverse proxy configuration
3. Configure environment variables
4. Set up Cloudflare Tunnel for external access
5. Create deployment documentation
6. Add health checks and logging
7. Test full deployment workflow

**Success Criteria**:
- [ ] Docker containers start successfully
- [ ] Frontend accessible via browser
- [ ] Videos upload and stream correctly
- [ ] External access via Cloudflare Tunnel
- [ ] Data persists across container restarts

### Minor UI/UX Improvements
**Priority**: Medium  
**Time**: 2-3 hours

- [ ] Mobile hamburger menu (improve mobile nav)
- [ ] Fix nested `<a>` tag warnings in dashboard VideoCard
- [ ] System configuration UI for admins
- [ ] Improve video player controls
- [ ] Add video description display
- [ ] Better error messages for failed uploads

---

## Long-Term Roadmap

### Phase 11: Performance & Scaling (Future)
- PostgreSQL migration option
- CDN integration for video delivery
- Video transcoding quality options
- Bulk operations for admin
- Advanced analytics

### Phase 12: Social Features (Future)
- Comments on videos
- Like/favorite system
- Video sharing with external links
- User follow/subscribe feature
- Activity feed

### Phase 13: Advanced Features (Future)
- Live streaming support
- Video editing capabilities
- Collaborative playlists
- Video collections/albums
- Advanced search with filters

---

## Known Issues

### Critical
- None

### Minor
1. **CreatePlaylistDialog not opening** - Click handler needs debugging (~15 min fix)
2. **Nested `<a>` tags warning** - Dashboard VideoCard has Link inside Link (pre-existing)
3. **TypeScript build errors** - Some existing files have type warnings (non-blocking)

### Technical Debt
1. Pre-existing SQLAlchemy type warnings in backend (safe to ignore)
2. Some unused imports in older files
3. Field component `label` prop type mismatch in admin.categories.tsx

---

## Development Commands

### Frontend
```bash
cd frontend
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Build for production
npm run lint         # Run ESLint
```

### Backend
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload  # Start dev server (http://localhost:8000)
python -m app.seed             # Seed database with test data
alembic upgrade head           # Run migrations
```

### Testing
- Use Playwright MCP server for manual browser testing
- Capture screenshots to `/tmp/playwright-mcp-output/`
- Test credentials in `backend/TEST_CREDENTIALS.md`

---

## Quick Reference

### Test Users (After Seeding)
- **Admin**: username `admin` / password `admin123`
- **Alice**: username `alice` / password `password123`
- **Bob**: username `bob` / password `password123`  
- **Charlie**: username `charlie` / password `password123`

### Key URLs
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### Important Files
- `PROJECT.md` - Long-term project specification and phase tracking
- `NEXT_STEPS.md` - This file (immediate tasks and short-term goals)
- `CHANGELOG.md` - Detailed change history
- `DEPLOYMENT_PLAN.md` - Docker and production deployment guide
- `AGENTS.md` - Code style and project structure guidelines

---

**Focus**: Complete Phase 9 polish → Begin Phase 10 (Docker deployment)

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

### 🚧 Phase 5: UI/UX Refinement (In Progress)
- ✅ Created reusable shared components (EmptyState, PageHeader, LoadingSpinner, Skeletons)
- ✅ Refined dashboard page with enhanced stats cards and better spacing
- ✅ Improved videos listing page with better cards, animations, and empty states
- ✅ Enhanced upload page with better drag-drop zone and quota display
- ✅ Polished video player page with back button and better loading states
- ✅ Redesigned profile page with icon-based layout
- ⏳ Mobile navigation improvements (planned)
- ⏳ Admin page refinements (planned)

### 📋 Phase 6-8: Advanced Features & Deployment (Planned)
- User profiles showing uploaded videos
- Admin dashboard with statistics
- System configuration management UI
- Additional end-to-end tests
- Docker deployment configuration

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

## Deployment

Designed for self-hosting via Docker with Cloudflare Tunnel for secure external access. Deployment configuration coming soon.

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

See `backend/.env.example` for all available options.

## License
---

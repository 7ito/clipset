# Clipset Backend

Backend API for Clipset - a private video sharing platform.

## Tech Stack

- **Framework**: FastAPI 0.115.0
- **Database**: SQLite (async with aiosqlite)
- **ORM**: SQLAlchemy 2.0.36
- **Authentication**: JWT (via python-jose)
- **Password Hashing**: bcrypt

## Setup

1. **Create virtual environment**:
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # or `./venv/bin/activate` on Linux/Mac
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Create `.env` file**:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and set your `SECRET_KEY` (generate with `python -c "import secrets; print(secrets.token_hex(32))"`).

4. **Run the server**:
   ```bash
   uvicorn app.main:app --reload
   ```

The server will start at `http://localhost:8000`.

## Initial Setup

On first run, an initial admin user is created automatically using credentials from `.env`:
- Username: `admin` (default)
- Password: `changeme123` (default)

**⚠️ Change the admin password immediately after first login!**

## API Documentation

- **Interactive Docs**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **Health Check**: http://localhost:8000/api/health

## Features Implemented

### Authentication
- ✅ User registration with invitation tokens
- ✅ Login with JWT tokens
- ✅ Case-insensitive email/username
- ✅ Password hashing with bcrypt

### User Management
- ✅ List users (admin only)
- ✅ View user profiles
- ✅ Soft delete users (admin only)
- ✅ Role-based access control

### Invitation System
- ✅ Create invitations (admin only)
- ✅ URL-safe token generation
- ✅ 7-day expiration
- ✅ Email validation
- ✅ One-time use tokens

### Category Management
- ✅ Full CRUD operations
- ✅ Automatic slug generation
- ✅ Video count aggregation
- ✅ Admin-only write access
- ✅ Unique slug enforcement

## Database

The SQLite database is created automatically at `../data/clipset.db`.

### Models
- **Users**: User accounts with auth and quota tracking
- **Invitations**: Email-based invitation tokens
- **Categories**: Video categories (ready for video feature)
- **Videos**: Video metadata (ready for video feature)
- **Config**: System configuration (ready for video feature)

## Environment Variables

See `.env.example` for all available configuration options.

Key variables:
- `SECRET_KEY`: JWT secret (required, min 32 chars)
- `DATABASE_URL`: Database connection string
- `FRONTEND_BASE_URL`: Frontend URL for invitation links
- `INITIAL_ADMIN_*`: Initial admin user credentials

## API Endpoints

### Auth (`/api/auth`)
- `POST /register` - Register with invitation token
- `POST /login` - Login and get JWT token
- `GET /me` - Get current user info

### Users (`/api/users`)
- `GET /users` - List all users (admin only)
- `GET /users/{id}` - Get user profile
- `DELETE /users/{id}` - Deactivate user (admin only)

### Invitations (`/api/invitations`)
- `POST /invitations` - Create invitation (admin only)
- `GET /invitations` - List invitations (admin only)
- `GET /invitations/validate/{token}` - Validate token (public)
- `DELETE /invitations/{id}` - Revoke invitation (admin only)

### Categories (`/api/categories`)
- `GET /categories/` - List all categories with video counts
- `GET /categories/{id}` - Get single category
- `POST /categories/` - Create category (admin only)
- `PATCH /categories/{id}` - Update category (admin only)
- `DELETE /categories/{id}` - Delete category (admin only)

## Testing the API

1. **Login as admin**:
   ```bash
   curl -X POST http://localhost:8000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"changeme123"}'
   ```

2. **Create an invitation** (use token from login):
   ```bash
   curl -X POST http://localhost:8000/api/invitations \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"email":"user@example.com"}'
   ```

3. **Register a new user**:
   ```bash
   curl -X POST http://localhost:8000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"user@example.com","username":"testuser","password":"password123","invitation_token":"TOKEN_FROM_STEP_2"}'
   ```

## Database Seeding

Seed the database with test data for development:

```bash
python -m app.seed
```

This creates:
- 6 sample categories (Gaming, Tutorials, Vlogs, Music, Sports, Cooking)
- 3 test users with different quota states (alice 0%, bob 50%, charlie 100%)
- 20 sample videos with various processing statuses
- Default config record

See `SEED_README.md` for details.

## Database Migrations

Migrations are managed with Alembic:

```bash
# Run migrations
alembic upgrade head

# Create new migration (after model changes)
alembic revision --autogenerate -m "Description"

# Downgrade to previous version
alembic downgrade -1
```

## Implementation Status

### ✅ Phase 0: Foundation (Completed)
- User authentication with JWT
- Invitation system
- Admin/user roles
- Database models for users and invitations

### ✅ Phase 1: Database Models (Completed)
- Category model with slug generation
- Video model with processing status tracking
- Config model for runtime settings
- Alembic migrations setup
- Enhanced seed script with sample data

### 🚧 Phase 2: Backend Services (Next)
- Storage service
- Video processor with FFmpeg
- Upload quota management
- Background job scheduler

### 📋 Phase 3: API Endpoints (Planned)
- Categories API
- Videos API (upload, stream, manage)
- Admin API (stats, config)

### 📋 Phase 4+: Frontend (Planned)
- Video upload interface
- Video playback
- Category management
- Admin dashboard

## Development

The API uses FastAPI's auto-reload feature. Any changes to Python files will automatically restart the server.

Database is created automatically on startup using SQLAlchemy's `create_all()`. For production, use Alembic migrations.

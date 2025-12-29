from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlalchemy import select
import logging
from app.config import settings
from app.database import init_db, async_session_maker
from app.models.user import User
from app.utils.security import hash_password
from app.api import (
    auth,
    users,
    invitations,
    categories,
    videos,
    playlists,
    config,
    comments,
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    logger.info("Starting up Clipset API...")

    # Initialize database
    await init_db()
    logger.info("Database initialized")

    # Create initial admin user if none exists
    await create_initial_admin()

    yield

    # Shutdown
    logger.info("Shutting down Clipset API...")


async def create_initial_admin():
    """Create initial admin user if no admin exists."""
    async with async_session_maker() as db:
        # Check if any admin users exist
        result = await db.execute(select(User).where(User.role == "admin"))
        admin_exists = result.scalar_one_or_none()

        if not admin_exists:
            # Create admin user
            admin = User(
                email=settings.INITIAL_ADMIN_EMAIL.lower(),
                username=settings.INITIAL_ADMIN_USERNAME.lower(),
                password_hash=hash_password(settings.INITIAL_ADMIN_PASSWORD),
                role="admin",
                is_active=True,
            )
            db.add(admin)
            await db.commit()

            logger.warning("=" * 60)
            logger.warning("INITIAL ADMIN USER CREATED")
            logger.warning(f"Username: {settings.INITIAL_ADMIN_USERNAME}")
            logger.warning(f"Email: {settings.INITIAL_ADMIN_EMAIL}")
            logger.warning(f"Password: {settings.INITIAL_ADMIN_PASSWORD}")
            logger.warning("PLEASE CHANGE THE PASSWORD AFTER FIRST LOGIN!")
            logger.warning("=" * 60)
        else:
            logger.info("Admin user already exists")


# Create FastAPI app
app = FastAPI(
    title="Clipset API",
    version="0.1.0",
    description="Private video sharing platform API",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def fix_proxy_headers(request: Request, call_next):
    """Fix scheme for redirects when behind a proxy."""
    if request.headers.get("x-forwarded-proto") == "https":
        request.scope["scheme"] = "https"
    return await call_next(request)


# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(invitations.router, prefix="/api/invitations", tags=["invitations"])
app.include_router(categories.router, prefix="/api/categories", tags=["categories"])
app.include_router(videos.router, prefix="/api/videos", tags=["videos"])
app.include_router(playlists.router, prefix="/api/playlists", tags=["playlists"])
app.include_router(config.router, prefix="/api/config", tags=["config"])
app.include_router(comments.router, prefix="/api", tags=["comments"])


# Health check endpoint
@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": "Clipset API",
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/api/health",
    }

"""
Database seeding script for Clipset development environment.

This script creates sample data for local development:
- Categories (Gaming, Tutorials, Vlogs, Music, Sports, Cooking)
- Test users with different quota states
- Sample videos using testupload.mp4 as source

Usage:
    python -m app.seed              # Reset database and seed
    python -m app.seed --no-reset   # Seed without resetting
"""

import asyncio
import sys
import argparse
import shutil
import random
from pathlib import Path
from datetime import datetime, timedelta
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import async_session_maker, init_db, Base, engine
from app.models.user import User, UserRole
from app.models.invitation import Invitation
from app.utils.security import hash_password

# Import all models to ensure they're registered with Base
# This is needed for Base.metadata.create_all() to work properly
import app.models.user
import app.models.invitation
import app.models.playlist


# Sample data
CATEGORIES = [
    {
        "name": "Gaming",
        "slug": "gaming",
        "description": "Gaming videos, live streams, walkthroughs, and gameplay highlights",
    },
    {
        "name": "Tutorials",
        "slug": "tutorials",
        "description": "Educational content, how-to guides, and step-by-step instructions",
    },
    {
        "name": "Vlogs",
        "slug": "vlogs",
        "description": "Daily life, personal stories, and behind-the-scenes content",
    },
    {
        "name": "Music",
        "slug": "music",
        "description": "Live performances, covers, original songs, and music production",
    },
    {
        "name": "Sports",
        "slug": "sports",
        "description": "Sports highlights, match analysis, training videos, and fitness content",
    },
    {
        "name": "Cooking",
        "slug": "cooking",
        "description": "Recipes, cooking tips, food reviews, and culinary adventures",
    },
]

USERS = [
    {
        "username": "alice",
        "email": "alice@example.com",
        "password": "password123",
        "role": UserRole.USER,
        "weekly_upload_bytes": 0,  # 0% quota used
        "bio": "Gaming enthusiast and content creator",
    },
    {
        "username": "bob",
        "email": "bob@example.com",
        "password": "password123",
        "role": UserRole.USER,
        "weekly_upload_bytes": 2_147_483_648,  # 50% quota used (2GB / 4GB)
        "bio": "Tutorial maker and educator",
    },
    {
        "username": "charlie",
        "email": "charlie@example.com",
        "password": "password123",
        "role": UserRole.USER,
        "weekly_upload_bytes": 4_294_967_296,  # 100% quota used (4GB / 4GB)
        "bio": "Daily vlogger, quota always full!",
    },
]

VIDEO_TITLES = [
    "Epic Gaming Montage",
    "How to Build a React App",
    "Morning Coffee Vlog",
    "Jazz Piano Performance",
    "Basketball Highlights",
    "Easy Pasta Recipe",
    "Speedrun World Record",
    "Python Tutorial for Beginners",
    "Day in My Life",
    "Guitar Solo Cover",
    "Soccer Match Analysis",
    "Baking Bread at Home",
    "Game Review: Latest RPG",
    "Web Development Tips",
    "Travel Vlog: Paris",
    "Live Concert Recording",
    "Workout Routine",
    "Cooking Show Episode 1",
    "Gameplay Commentary",
    "CSS Grid Tutorial",
]

VIDEO_DESCRIPTIONS = [
    "Check out this awesome content!",
    "Hope you enjoy this video. Don't forget to like and subscribe!",
    "This took me forever to create, hope you like it!",
    "Let me know what you think in the comments!",
    None,  # Some videos have no description
    "Part 1 of a series, more coming soon!",
    "Thanks for watching! Share with your friends!",
    "My best work yet, what do you think?",
    None,
    "Recorded live, sorry for any mistakes!",
]


async def clear_database(db: AsyncSession):
    """Clear all data from database tables."""
    print("🗑️  Clearing existing data...")

    from app.models.video import Video
    from app.models.category import Category
    from app.models.config import Config
    from app.models.playlist import Playlist, PlaylistVideo

    # Clear in correct order due to foreign keys
    await db.execute(delete(PlaylistVideo))
    await db.execute(delete(Playlist))
    await db.execute(delete(Video))
    await db.execute(delete(Category))
    await db.execute(delete(Invitation))
    await db.execute(delete(User).where(User.username != "admin"))
    # Don't delete Config - it's a singleton
    await db.commit()

    print("✅ Database cleared")


async def create_categories(db: AsyncSession) -> list:
    """Create sample categories."""
    print("📁 Creating categories...")

    from app.models.category import Category

    # Get admin user
    admin = await db.execute(select(User).where(User.role == UserRole.ADMIN))
    admin_user = admin.scalar_one()

    categories = []
    for cat_data in CATEGORIES:
        category = Category(
            name=cat_data["name"],
            slug=cat_data["slug"],
            description=cat_data.get("description"),
            created_by=admin_user.id,
        )
        db.add(category)
        categories.append(category)

    await db.commit()

    # Refresh to get IDs
    for category in categories:
        await db.refresh(category)

    print(f"✅ Created {len(categories)} categories")
    return categories


async def create_users(db: AsyncSession) -> list:
    """Create sample users with different quota states."""
    print("👥 Creating sample users...")

    users = []
    for user_data in USERS:
        user = User(
            username=user_data["username"],
            email=user_data["email"],
            password_hash=hash_password(user_data["password"]),
            role=user_data["role"],
            weekly_upload_bytes=user_data["weekly_upload_bytes"],
            last_upload_reset=datetime.utcnow() - timedelta(days=random.randint(0, 6)),
        )
        db.add(user)
        users.append(user)

    await db.commit()

    # Refresh to get IDs
    for user in users:
        await db.refresh(user)

    print(f"✅ Created {len(users)} users:")
    for user in users:
        quota_pct = (user.weekly_upload_bytes / 4_294_967_296) * 100
        print(f"   - {user.username} (quota: {quota_pct:.0f}%)")

    return users


async def create_videos(db: AsyncSession, users: list, categories: list) -> list:
    """Create sample videos using testupload.mp4."""
    print("🎬 Creating sample videos...")

    from app.models.video import Video, ProcessingStatus
    import uuid

    videos = []
    # from app.models.video import Video, ProcessingStatus
    # import uuid
    #
    # Check if test video exists
    test_video_path = Path("../testupload.mp4")
    if not test_video_path.exists():
        print("⚠️  testupload.mp4 not found, skipping video creation")
        return videos

    # Get video file info
    test_video_size = test_video_path.stat().st_size

    # Create upload directories
    video_dir = Path("../data/uploads/videos")
    thumb_dir = Path("../data/uploads/thumbnails")
    video_dir.mkdir(parents=True, exist_ok=True)
    thumb_dir.mkdir(parents=True, exist_ok=True)

    # Processing statuses to use
    statuses = [
        ProcessingStatus.COMPLETED,  # 70% completed
        ProcessingStatus.COMPLETED,
        ProcessingStatus.COMPLETED,
        ProcessingStatus.COMPLETED,
        ProcessingStatus.COMPLETED,
        ProcessingStatus.COMPLETED,
        ProcessingStatus.COMPLETED,
        ProcessingStatus.PROCESSING,  # 20% processing
        ProcessingStatus.PROCESSING,
        ProcessingStatus.FAILED,  # 10% failed
    ]

    num_videos = min(len(VIDEO_TITLES), 20)

    for i in range(num_videos):
        # Generate unique filenames
        file_id = str(uuid.uuid4())
        video_filename = f"{file_id}.mp4"
        thumb_filename = f"{file_id}.jpg"

        # Copy test video to simulate upload
        if i % 2 == 0:  # Only copy for some videos to save disk space
            video_dest = video_dir / video_filename
            shutil.copy(test_video_path, video_dest)

            # Generate thumbnail using ffmpeg if available
            import subprocess

            try:
                subprocess.run(
                    [
                        "ffmpeg",
                        "-i",
                        str(video_dest),
                        "-ss",
                        "00:00:01",
                        "-vframes",
                        "1",
                        "-q:v",
                        "2",
                        str(thumb_dir / thumb_filename),
                    ],
                    capture_output=True,
                    check=True,
                )
            except Exception as e:
                print(f"   ⚠️  Failed to generate thumbnail for {video_filename}: {e}")
                # Fallback: copy an existing thumbnail if any
                existing_thumbs = list(thumb_dir.glob("*.jpg"))
                if existing_thumbs:
                    shutil.copy(existing_thumbs[0], thumb_dir / thumb_filename)
        else:
            # For videos without a file, just copy an existing thumbnail as placeholder
            existing_thumbs = list(thumb_dir.glob("*.jpg"))
            if existing_thumbs:
                shutil.copy(existing_thumbs[0], thumb_dir / thumb_filename)

        # Select random user and category
        user = random.choice(users)
        category = random.choice(categories) if categories else None
        status = random.choice(statuses)

        # Create video record
        video = Video(
            title=VIDEO_TITLES[i],
            description=random.choice(VIDEO_DESCRIPTIONS),
            filename=video_filename,
            thumbnail_filename=thumb_filename,
            original_filename="testupload.mp4",
            file_size_bytes=test_video_size,
            duration_seconds=random.randint(30, 600),  # 30s to 10min
            uploaded_by=user.id,
            category_id=category.id if category else None,
            processing_status=status,
            error_message="Failed to process video: codec not supported"
            if status == ProcessingStatus.FAILED
            else None,
            view_count=random.randint(0, 500)
            if status == ProcessingStatus.COMPLETED
            else 0,
            created_at=datetime.utcnow()
            - timedelta(days=random.randint(0, 30), hours=random.randint(0, 23)),
        )

        db.add(video)
        videos.append(video)

    await db.commit()
    print(f"✅ Created {len(videos)} sample videos")
    return videos


async def create_playlists(db: AsyncSession, users: list, videos: list) -> list:
    """Create sample playlists with videos."""
    print("📝 Creating sample playlists...")

    from app.models.playlist import Playlist, PlaylistVideo
    from app.models.video import ProcessingStatus

    if not videos:
        print("⚠️  No videos available, skipping playlist creation")
        return []

    # Filter to only completed videos for playlists
    completed_videos = [
        v for v in videos if v.processing_status == ProcessingStatus.COMPLETED
    ]
    if not completed_videos:
        print("⚠️  No completed videos, skipping playlist creation")
        return []

    playlists = []

    # Create playlists for each user
    playlist_templates = [
        {"name": "Favorites", "description": "My favorite videos", "is_public": True},
        {
            "name": "Watch Later",
            "description": "Videos to watch later",
            "is_public": False,
        },
        {
            "name": "Best of {year}",
            "description": "Top picks from this year",
            "is_public": True,
        },
    ]

    for user in users[:2]:  # Create playlists for first 2 users (alice and bob)
        for i, template in enumerate(playlist_templates[:2]):  # 2 playlists per user
            playlist_name = template["name"].format(year=datetime.utcnow().year)
            playlist = Playlist(
                name=playlist_name,
                description=template["description"],
                created_by=user.id,
                is_public=template["is_public"],
            )
            db.add(playlist)
            await db.flush()  # Get ID before adding videos

            # Add 3-5 random completed videos to each playlist
            num_videos = min(random.randint(3, 5), len(completed_videos))
            selected_videos = random.sample(completed_videos, num_videos)

            for position, video in enumerate(selected_videos):
                playlist_video = PlaylistVideo(
                    playlist_id=playlist.id,
                    video_id=video.id,
                    position=position,
                    added_by=user.id,
                )
                db.add(playlist_video)

            playlists.append(playlist)

    await db.commit()
    print(f"✅ Created {len(playlists)} playlists")
    return playlists


async def create_config(db: AsyncSession):
    """Create default config record."""
    print("⚙️  Creating config...")

    from app.models.config import Config

    # Check if config already exists
    result = await db.execute(select(Config).where(Config.id == 1))
    existing_config = result.scalar_one_or_none()

    if not existing_config:
        config = Config(
            id=1,
            max_file_size_bytes=2_147_483_648,  # 2GB
            weekly_upload_limit_bytes=4_294_967_296,  # 4GB
            video_storage_path="./data/uploads/videos",
        )
        db.add(config)
        await db.commit()
        print("✅ Config created")
    else:
        print("✅ Config already exists")


async def seed_database(reset: bool = True):
    """Main seeding function."""
    print("\n" + "=" * 60)
    print("🌱 CLIPSET DATABASE SEEDING")
    print("=" * 60 + "\n")

    # Initialize database
    await init_db()

    async with async_session_maker() as db:
        if reset:
            await clear_database(db)

        # Create sample data
        categories = await create_categories(db)
        users = await create_users(db)
        videos = await create_videos(db, users, categories)
        playlists = await create_playlists(db, users, videos)
        await create_config(db)

    print("\n" + "=" * 60)
    print("✅ SEEDING COMPLETE!")
    print("=" * 60)
    print("\n📋 Summary:")
    print(f"   Categories: {len(categories)}")
    print(f"   Users: {len(users)}")
    print(f"   Videos: {len(videos)}")
    print(f"   Playlists: {len(playlists)}")
    print("\n🔐 Test User Credentials:")
    print("   Username: alice   | Password: password123 | Quota: 0%")
    print("   Username: bob     | Password: password123 | Quota: 50%")
    print("   Username: charlie | Password: password123 | Quota: 100%")
    print("   Username: admin   | Password: admin123    | Role: Admin")
    print("\n")


async def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Seed Clipset database with sample data"
    )
    parser.add_argument(
        "--no-reset",
        action="store_true",
        help="Don't clear existing data before seeding",
    )
    args = parser.parse_args()

    try:
        await seed_database(reset=not args.no_reset)
    except Exception as e:
        print(f"\n❌ Error during seeding: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())

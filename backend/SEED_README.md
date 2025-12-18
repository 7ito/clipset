# Database Seeding

This script populates the database with sample data for development and testing.

## What Gets Created

### Users (3 test users + admin)
- **alice** - 0% quota used
  - Email: alice@example.com
  - Password: password123
  - Role: User

- **bob** - 50% quota used (2GB / 4GB)
  - Email: bob@example.com
  - Password: password123
  - Role: User

- **charlie** - 100% quota used (4GB / 4GB)
  - Email: charlie@example.com
  - Password: password123
  - Role: User

- **admin** - Administrator (created on app startup)
  - Email: admin@clipset.local
  - Password: admin123
  - Role: Admin

### Categories (6 categories)
- Gaming
- Tutorials
- Vlogs
- Music
- Sports
- Cooking

### Videos (~20 sample videos)
- Uses `testupload.mp4` as source
- Various processing states:
  - 70% completed (ready to watch)
  - 20% processing (shows processing UI)
  - 10% failed (shows error UI)
- Random categories, uploaders, view counts
- Created at various times (0-30 days ago)

### Config
- Max file size: 2GB
- Weekly upload limit: 4GB
- Video storage path: ./data/uploads/videos

## Usage

### Reset and Seed Database
```bash
cd backend
python -m app.seed
```

This will:
1. Clear all existing data (except admin user)
2. Create sample categories, users, and videos
3. Copy `testupload.mp4` to uploads directory
4. Create video records in database

### Seed Without Resetting
```bash
python -m app.seed --no-reset
```

This will add sample data without clearing existing records.

## Requirements

- `testupload.mp4` must exist in project root
- Backend virtual environment activated
- Database initialized (migrations run)

## File Structure After Seeding

```
backend/
├── data/
│   ├── clipset.db          # Database with sample data
│   └── uploads/
│       ├── videos/         # Copied test videos
│       │   ├── abc-123.mp4
│       │   └── ...
│       └── thumbnails/     # Generated thumbnails (when processing is implemented)
│           ├── abc-123.jpg
│           └── ...
```

## When to Use

✅ **Good for:**
- Setting up local development environment
- Testing video features without manual uploads
- Demonstrating the application
- Testing different quota scenarios
- Resetting to known state

❌ **NOT for:**
- Production environments
- Real user data
- Automated tests (use fixtures instead)

## Troubleshooting

### "testupload.mp4 not found"
Make sure `testupload.mp4` exists in the project root directory.

### Database errors
Ensure migrations have been run:
```bash
alembic upgrade head
```

### Import errors
Make sure you're in the backend directory and virtual environment is activated:
```bash
cd backend
source venv/bin/activate  # or venv/Scripts/activate on Windows
```

## Notes

- The seed script will skip creating videos/categories until those models are implemented in Phase 1
- Currently only creates users (alice, bob, charlie)
- Full functionality will be available after Phase 1 (database models) is complete

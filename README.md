# Clipset

A private, self-hostable video sharing platform for friends, family, and small communities.

Share videos without compression, file size limits, or algorithmic feeds. Deploy with Docker and own your content.

Social media platforms compress your videos and impose restrictive upload limits. Clipset gives you an option for full control:

- **No compression** - Upload and stream videos in their original quality
- **No file size limits** - Share that 4K gaming highlight or hour-long family video
- **No algorithms** - A simple, chronological feed of content from your community
- **Self-hosted** - Your videos stay on your hardware, not someone else's server
- **Private by default** - Invitation-only access for your trusted circle

## Features

### Video Sharing
- **Drag-and-drop uploads** with real-time progress tracking
- **Batch uploads** - Upload multiple videos at once with shared settings
- **Automatic transcoding** to web-optimized H.264 (GPU-accelerated with NVIDIA NVENC)
- **Byte-range streaming** for instant seeking to any point in a video
- **Short, shareable URLs** - Clean links like `/v/abc123` instead of long UUIDs

### Organization
- **Categories** - Organize videos by type (Gaming, Sports, Family, etc.) with custom cover images
- **Playlists** - Create ordered collections with drag-and-drop reordering
- **Search and filters** - Find videos by title, uploader, or category

### Social
- **User profiles** - Instagram-style pages showing each member's uploads
- **Community directory** - Browse and discover other members
- **Comments** - Discuss videos with clickable timestamps that jump to specific moments
- **Share dialog** - Copy links with optional "start at timestamp" support

### Administration
- **Invitation system** - Generate email-linked invite codes for controlled access
- **Upload quotas** - Set weekly limits per user to manage storage
- **Role-based permissions** - Admin and user roles with appropriate access
- **Web-based configuration** - Adjust storage paths, file limits, and quotas without editing files

### Performance
- **GPU transcoding** - 3-10x faster video processing with NVIDIA NVENC
- **Nginx static serving** - Thumbnails and images served with 1-year cache headers
- **Async processing** - Upload videos and keep browsing while they transcode in the background

## Quick Start

```bash
# Clone and configure
git clone https://github.com/your-username/clipset.git
cd clipset
cp .env.example .env

# Generate a secure secret key
openssl rand -hex 32  # Add this to .env as SECRET_KEY

# Start Clipset
docker compose up -d

# Access at http://localhost
```

**Default credentials:**
- Username: `admin`
- Password: Value from `INITIAL_ADMIN_PASSWORD` in `.env`

> Change the admin password immediately after first login.

## Documentation

- **[Deployment Guide](DEPLOYMENT.md)** - Complete setup instructions, external drive configuration, backups, and troubleshooting
- **[Cloudflare Tunnel Guide](CLOUDFLARE_TUNNEL.md)** - Secure external access without exposing ports

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite, TailwindCSS 4, TanStack Router |
| Backend | FastAPI, SQLAlchemy (async), Pydantic |
| Database | SQLite |
| Proxy | Nginx |
| Container | Docker, Docker Compose |
| Transcoding | FFmpeg with NVIDIA NVENC support |

## System Requirements

- **Docker Engine** 20.10+
- **Memory**: 2GB minimum, 4GB+ recommended
- **Storage**: 100GB+ recommended for video storage
- **GPU** (optional): NVIDIA GTX 10-series or newer for hardware transcoding

## Configuration

Key settings in `.env`:

```env
# Security
SECRET_KEY=your-generated-secret-key
INITIAL_ADMIN_PASSWORD=change-me

# Storage
VIDEO_STORAGE_PATH=/data/uploads/videos
MAX_FILE_SIZE_BYTES=2147483648        # 2GB
WEEKLY_UPLOAD_LIMIT_BYTES=4294967296  # 4GB per user

# GPU Transcoding (optional)
USE_GPU_TRANSCODING=true
NVENC_PRESET=p4    # p1 (fastest) to p7 (best quality)
NVENC_CQ=20        # 18 (best) to 30 (most compressed)
```

See `.env.example` for all available options.

## Development

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

API documentation available at `http://localhost:8000/docs` when the backend is running.

## License

MIT

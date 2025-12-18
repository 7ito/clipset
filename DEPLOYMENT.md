# Clipset Deployment Guide

Complete guide for deploying Clipset using Docker and Docker Compose.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Development Mode](#development-mode)
- [Production Mode](#production-mode)
- [External Drive Setup](#external-drive-setup)
- [Configuration](#configuration)
- [Maintenance](#maintenance)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

- **Docker Engine** 20.10+ ([Install Docker](https://docs.docker.com/engine/install/))
- **Docker Compose** v2+ (included with Docker Desktop)
- **Disk Space**: 
  - Minimum: 10GB (OS + Docker images)
  - Recommended: 100GB+ for video storage
- **Memory**: 2GB RAM minimum, 4GB+ recommended
- **CPU**: 2+ cores recommended for video processing

### Verify Installation

```bash
docker --version          # Should be 20.10+
docker compose version    # Should be v2.0+
```

---

## Quick Start

### 1. Clone Repository

```bash
git clone <repository-url> clipset
cd clipset
```

### 2. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Generate a secure secret key
openssl rand -hex 32

# Edit .env and set SECRET_KEY
nano .env  # or your preferred editor
```

**Minimum required changes in `.env`:**
- `SECRET_KEY` - Paste the generated key
- `INITIAL_ADMIN_PASSWORD` - Change from default

### 3. Start Clipset

```bash
# Development mode (with hot reload)
docker compose up -d

# Production mode
docker compose -f docker-compose.prod.yml up -d
```

### 4. Access Clipset

Open your browser to: **http://localhost**

**Default admin credentials:**
- Username: `admin`
- Password: (value from `.env` INITIAL_ADMIN_PASSWORD)

**⚠️ Important:** Change the admin password immediately after first login!

---

## Development Mode

Development mode includes hot reloading for both frontend and backend code changes.

### Starting Development Environment

```bash
docker compose up -d
```

### Services

- **Frontend**: Vite dev server with HMR (Hot Module Replacement)
- **Backend**: Uvicorn with auto-reload
- **Nginx**: Reverse proxy routing

### Accessing Services

- **Main App**: http://localhost (through nginx)
- **Backend API**: http://localhost:8000 (direct access)
- **Frontend Dev**: http://localhost:5173 (direct access)
- **API Docs**: http://localhost/docs

### Viewing Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f nginx
```

### Stopping Services

```bash
# Stop containers (data persists)
docker compose down

# Stop and remove volumes (⚠️ deletes data)
docker compose down -v
```

### Code Changes

Changes to code in `./backend` and `./frontend` are automatically detected and hot-reloaded. No need to rebuild containers.

---

## Production Mode

Production mode uses optimized builds without development dependencies.

### Building and Starting

```bash
# Build images and start
docker compose -f docker-compose.prod.yml up -d --build

# View logs
docker compose -f docker-compose.prod.yml logs -f
```

### Differences from Development

- ✅ Optimized production builds
- ✅ No source code mounted (smaller attack surface)
- ✅ Log rotation (10MB max, 3 files)
- ✅ Auto-restart on failures (`restart: always`)
- ❌ No hot reload
- ❌ No direct port exposure (only nginx on :80)

### Updating Production

```bash
# Pull latest code
git pull

# Rebuild and restart
docker compose -f docker-compose.prod.yml up -d --build

# Verify health
docker compose -f docker-compose.prod.yml ps
```

---

## External Drive Setup

Use an external drive for video storage without changing Docker configuration.

### Method: Bind Mount (Recommended)

This approach keeps all paths under `/data` as required by Clipset's path validation.

#### Step 1: Prepare External Drive

```bash
# Find your drive
lsblk
# Example output: sdb1 (your external drive)

# Create mount point on host
sudo mkdir -p /mnt/my-external-drive

# Mount the drive
sudo mount /dev/sdb1 /mnt/my-external-drive

# Verify mount
df -h | grep sdb1
```

#### Step 2: Bind Mount to Data Directory

```bash
# Create external directory in data
mkdir -p ./data/external

# Bind mount external drive
sudo mount --bind /mnt/my-external-drive ./data/external

# Verify
ls -la ./data/external
```

#### Step 3: Make Persistent (Survive Reboots)

Add to `/etc/fstab`:

```bash
sudo nano /etc/fstab
```

Add these lines:

```
# External drive
/dev/sdb1  /mnt/my-external-drive  ext4  defaults  0  2

# Bind mount to Docker data
/mnt/my-external-drive  /path/to/clipset/data/external  none  bind  0  0
```

Replace `/path/to/clipset` with your actual path.

#### Step 4: Set Permissions

```bash
# Ensure Docker can write
sudo chown -R $USER:$USER ./data/external
chmod -R 755 ./data/external
```

#### Step 5: Update Storage Paths

**Option A: Via Admin Panel** (Phase 11 feature)
- Navigate to Admin → Settings
- Change `VIDEO_STORAGE_PATH` to `/data/external/videos`
- System will create directory automatically

**Option B: Via .env (Requires Container Restart)**

Edit `.env`:
```
VIDEO_STORAGE_PATH=/data/external/videos
THUMBNAIL_STORAGE_PATH=/data/external/thumbnails
```

Restart containers:
```bash
docker compose down
docker compose up -d
```

### Verification

Upload a test video and check:

```bash
ls -la ./data/external/videos
# Should see video file

# Check actual disk usage
du -sh /mnt/my-external-drive
```

---

## Configuration

### Environment Variables

All configuration is done via `.env` file. See `.env.example` for all options.

#### Key Settings

**Security:**
```env
SECRET_KEY=your-generated-secret-key-here
INITIAL_ADMIN_PASSWORD=change-me-now
```

**Storage Paths:**
```env
VIDEO_STORAGE_PATH=/data/uploads/videos
THUMBNAIL_STORAGE_PATH=/data/uploads/thumbnails
CATEGORY_IMAGE_STORAGE_PATH=/data/uploads/category-images
```

**Upload Limits:**
```env
MAX_FILE_SIZE_BYTES=2147483648          # 2GB
WEEKLY_UPLOAD_LIMIT_BYTES=4294967296    # 4GB
```

**CORS (for Cloudflare Tunnel):**
```env
BACKEND_CORS_ORIGINS=http://localhost,https://your-domain.com
```

### Changing Storage Paths

**⚠️ Warning:** Changing storage paths does NOT move existing files. You must manually migrate data.

**Migration Process:**

```bash
# 1. Stop containers
docker compose down

# 2. Move files
sudo mv ./data/uploads/videos/* ./data/external/videos/
sudo mv ./data/uploads/thumbnails/* ./data/external/thumbnails/

# 3. Update .env
VIDEO_STORAGE_PATH=/data/external/videos
THUMBNAIL_STORAGE_PATH=/data/external/thumbnails

# 4. Restart
docker compose up -d

# 5. Verify videos still play
```

---

## Maintenance

### Backup

#### Database Backup

```bash
# Create backup directory
mkdir -p backups

# Backup database
cp data/clipset.db backups/clipset-$(date +%Y%m%d-%H%M%S).db
```

#### Media Backup

```bash
# Backup all media files (videos, thumbnails, images)
tar -czf backups/media-$(date +%Y%m%d-%H%M%S).tar.gz data/uploads/
```

#### Automated Backup Script

Create `scripts/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d-%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database
cp data/clipset.db $BACKUP_DIR/clipset-$DATE.db

# Backup media
tar -czf $BACKUP_DIR/media-$DATE.tar.gz data/uploads/

echo "Backup complete: $BACKUP_DIR/"
ls -lh $BACKUP_DIR/ | tail -2
```

Run with cron:

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * cd /path/to/clipset && ./scripts/backup.sh
```

### Restore

#### Database Restore

```bash
# Stop containers
docker compose down

# Restore database
cp backups/clipset-20241218-020000.db data/clipset.db

# Start containers
docker compose up -d
```

#### Media Restore

```bash
# Extract media files
tar -xzf backups/media-20241218-020000.tar.gz
```

### Updates

```bash
# Pull latest code
git pull

# Rebuild containers
docker compose down
docker compose up -d --build

# Verify
docker compose ps
docker compose logs -f
```

### Monitoring

#### Container Status

```bash
# Check running containers
docker compose ps

# Resource usage
docker stats
```

#### Disk Usage

```bash
# Check data directory size
du -sh ./data/

# Check video storage
du -sh ./data/uploads/videos/

# Check available space
df -h ./data
```

#### Logs

```bash
# Tail logs
docker compose logs -f

# Last 100 lines
docker compose logs --tail=100

# Specific time range
docker compose logs --since="2024-01-01T00:00:00"
```

---

## Troubleshooting

### Container Won't Start

**Check logs:**
```bash
docker compose logs backend
```

**Common issues:**

1. **Missing `.env` file**
   ```bash
   cp .env.example .env
   # Edit and set SECRET_KEY
   ```

2. **Port 80 already in use**
   ```bash
   # Check what's using port 80
   sudo lsof -i :80
   
   # Option 1: Stop conflicting service
   sudo systemctl stop apache2  # or nginx
   
   # Option 2: Change port in docker-compose.yml
   ports:
     - "8080:80"  # Use port 8080 instead
   ```

3. **Permission errors**
   ```bash
   sudo chown -R $USER:$USER ./data/
   chmod -R 755 ./data/
   ```

### Can't Login

1. **Wrong credentials** - Check `.env` for INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD

2. **Secret key changed** - All tokens invalidated. Clear browser cookies and login again.

3. **Database missing** - Check if `./data/clipset.db` exists

### Videos Won't Upload

1. **Disk space full**
   ```bash
   df -h ./data
   # Free up space or change storage path
   ```

2. **File size too large** - Check `MAX_FILE_SIZE_BYTES` in `.env`

3. **Weekly quota exceeded** - Reset quota via admin panel or wait for weekly reset

4. **FFmpeg errors** - Check backend logs:
   ```bash
   docker compose logs backend | grep -i ffmpeg
   ```

### Videos Won't Play

1. **Processing status** - Check if video status is "completed":
   ```bash
   docker compose logs backend | grep processing
   ```

2. **File doesn't exist** - Verify file in storage:
   ```bash
   ls -la ./data/uploads/videos/
   ```

3. **Browser console errors** - Open browser DevTools (F12) and check Network tab

4. **CORS errors** - Add your domain to `BACKEND_CORS_ORIGINS` in `.env`

### External Drive Not Accessible

1. **Mount verification**
   ```bash
   mount | grep sdb1
   df -h | grep external
   ```

2. **Permissions**
   ```bash
   ls -la ./data/external
   sudo chown -R $USER:$USER ./data/external
   ```

3. **Path validation** - Ensure paths start with `/data/`:
   ```bash
   # ✅ Valid
   /data/external/videos
   
   # ❌ Invalid (will be rejected)
   /mnt/external/videos
   ```

### Health Check Failing

```bash
# Check health status
docker compose ps

# Test health endpoint manually
curl http://localhost:8000/api/health

# Check backend logs
docker compose logs backend
```

---

## Advanced Topics

### Custom Ports

Edit `docker-compose.yml`:

```yaml
nginx:
  ports:
    - "8080:80"  # Access via http://localhost:8080
```

Update frontend environment:

```yaml
frontend:
  environment:
    - VITE_API_BASE_URL=http://localhost:8080/api
```

### Using PostgreSQL (Future)

Currently uses SQLite. PostgreSQL migration planned for Phase 11+.

### Cloudflare Tunnel

See [CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md) for complete setup guide.

---

## Support

- **Issues**: https://github.com/sst/clipset/issues
- **Documentation**: https://github.com/sst/clipset
- **Logs**: Always include logs when reporting issues:
  ```bash
  docker compose logs > clipset-logs.txt
  ```

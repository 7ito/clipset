# Clipset Deployment Guide

## Prerequisites

- **Docker Engine** 20.10+ and **Docker Compose** v2+
- **Memory**: 2GB minimum, 4GB+ recommended
- **Storage**: 100GB+ recommended for video storage
- **GPU** (optional): NVIDIA GTX 10-series or newer for hardware transcoding

## Quick Start

```bash
# Clone and configure
git clone <repository-url> clipset
cd clipset
cp .env.example .env

# Generate secret key and add to .env
openssl rand -hex 32

# Start Clipset
docker compose -f docker-compose.prod.yml up -d --build
```

Access at **http://localhost** with credentials from your `.env` file.

## Configuration

### Required Settings

Edit `.env` before first run:

```env
SECRET_KEY=<generated-key>
INITIAL_ADMIN_PASSWORD=<secure-password>
```

### Admin Panel Settings

These can be changed at runtime via **Admin > Settings**:

| Setting | Description | Default |
|---------|-------------|---------|
| Max File Size | Maximum upload size per file | 2 GB |
| Weekly Upload Quota | Per-user weekly upload limit | 4 GB |
| Video Storage Path | Where videos are stored | `/data/uploads/videos` |

### GPU Transcoding

For 3-10x faster video processing with NVIDIA GPUs:

```env
USE_GPU_TRANSCODING=true
NVENC_PRESET=p4          # p1 (fastest) to p7 (best quality)
NVENC_CQ=20              # 18 (best) to 30 (most compressed)
```

**Requirements**: NVIDIA drivers 530+, nvidia-container-toolkit

Clipset automatically falls back to CPU if GPU is unavailable.

### External Storage

To use an external drive:

```bash
# Mount drive to data directory
mkdir -p ./data/external
sudo mount --bind /mnt/your-drive ./data/external

# Then set path in Admin > Settings
# Video Storage Path: /data/external/videos
```

Add to `/etc/fstab` for persistence across reboots.

## Common Commands

```bash
# View logs
docker compose -f docker-compose.prod.yml logs -f

# Update to latest version
git pull && docker compose -f docker-compose.prod.yml up -d --build

# Backup database
cp data/clipset.db backups/clipset-$(date +%Y%m%d).db
```

## External Access

For access outside your local network, see [CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md).

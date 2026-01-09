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
cp .env.production.example .env

# Generate secrets and add to .env
echo "JWT_SECRET=$(openssl rand -base64 32)"
echo "HLS_SIGNING_SECRET=$(openssl rand -base64 24)"
echo "POSTGRES_PASSWORD=$(openssl rand -base64 16)"

# Edit .env with your secrets and admin password
nano .env

# Start Clipset (with GPU)
docker compose -f docker-compose.prod.yml -f docker-compose.gpu.yml up -d --build

# Or without GPU
docker compose -f docker-compose.prod.yml up -d --build
```

Access at **http://localhost** with credentials from your `.env` file.

## Configuration

### Required Settings

Edit `.env` before first run:

```env
POSTGRES_PASSWORD=<generated-password>
JWT_SECRET=<generated-secret>
HLS_SIGNING_SECRET=<generated-secret>
INITIAL_ADMIN_PASSWORD=<secure-password>
```

### Admin Panel Settings

These can be changed at runtime via **Admin > Settings**:

| Setting | Description | Default |
|---------|-------------|---------|
| Max File Size | Maximum upload size per file | 3 GB |
| Weekly Upload Quota | Per-user weekly upload limit | 4 GB |
| Video Storage Path | Where videos are stored | `/data/uploads/videos` |

### GPU Transcoding

For 3-10x faster video processing with NVIDIA GPUs:

```bash
# Use GPU compose overlay
docker compose -f docker-compose.prod.yml -f docker-compose.gpu.yml up -d
```

GPU settings can be configured in **Admin > Settings**:
- NVENC Preset: p1 (fastest) to p7 (best quality)
- NVENC CQ: 16-30 (lower = better quality)

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

All commands run from the project root:

```bash
# View logs
docker compose -f docker-compose.prod.yml logs -f

# View specific service logs
docker compose -f docker-compose.prod.yml logs -f backend

# Update to latest version
git pull && docker compose -f docker-compose.prod.yml -f docker-compose.gpu.yml up -d --build

# Backup database
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U clipset clipset > backup-$(date +%Y%m%d).sql

# Health check
curl http://localhost/api/health

# Stop all services
docker compose -f docker-compose.prod.yml down
```

## Development

For local development with hot reload:

```bash
# Copy dev environment
cp .env.example .env

# Start development stack
docker compose up -d

# View logs
docker compose logs -f

# Access at http://localhost:8080
```

## Migration from SQLite (Python Backend)

If migrating from the old Python/SQLite backend:

```bash
# 1. Backup old database
cp data/clipset.db data/clipset.db.backup

# 2. Start PostgreSQL
docker compose -f docker-compose.prod.yml up -d postgres
sleep 10

# 3. Run migration
docker compose -f docker-compose.prod.yml run --rm backend clipset migrate \
  --sqlite-path /data/clipset.db \
  --postgres-url "postgres://clipset:YOUR_PASSWORD@postgres:5432/clipset?sslmode=disable"

# 4. Start all services
docker compose -f docker-compose.prod.yml -f docker-compose.gpu.yml up -d
```

## Project Structure

```
clipset/
├── docker-compose.yml          # Development compose
├── docker-compose.prod.yml     # Production compose
├── docker-compose.gpu.yml      # GPU overlay
├── .env                        # Environment config
├── nginx/                      # Nginx configs
│   ├── nginx.conf.template
│   └── nginx.prod.conf.template
├── backend/                    # Go backend
│   ├── Dockerfile
│   ├── Dockerfile.gpu
│   └── ...
├── frontend/                   # React frontend
│   ├── Dockerfile
│   ├── Dockerfile.prod
│   └── ...
└── data/                       # Persistent data
    └── uploads/
```

## External Access

For access outside your local network, see [CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md).

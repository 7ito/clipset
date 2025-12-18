# Deployment & Docker Plan

## Status
📋 **Planned** - Implementation pending video upload/playback features

## Overview
Complete Docker-based deployment for Clipset with development and production configurations, Nginx reverse proxy, and Cloudflare Tunnel setup for external access.

---

## Project Structure

```
clipset/
├── backend/
│   ├── Dockerfile
│   ├── .dockerignore
│   └── ...
├── frontend/
│   ├── Dockerfile
│   ├── .dockerignore
│   └── ...
├── nginx/
│   ├── nginx.conf
│   └── nginx.prod.conf
├── data/                    # Created by Docker
│   ├── videos/
│   ├── thumbnails/
│   └── clipset.db
├── docker-compose.yml       # Development
├── docker-compose.prod.yml  # Production
├── .env
├── .env.example
├── .gitignore
└── README.md
```

---

## Phase 1: Backend Dockerfile

### 1.1 Backend Dockerfile (`backend/Dockerfile`)

```dockerfile
FROM python:3.11-slim

# Install FFmpeg
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Run migrations and start server
CMD alembic upgrade head && \
    uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 1.2 Backend .dockerignore

```
__pycache__
*.pyc
*.pyo
*.pyd
.Python
*.so
*.egg
*.egg-info
dist
build
.env
.venv
venv/
*.db
*.sqlite
alembic/versions/*.pyc
```

---

## Phase 2: Frontend Dockerfile

### 2.1 Frontend Dockerfile (`frontend/Dockerfile`)

**Development:**
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
```

**Production:**
```dockerfile
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage - serve with nginx
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### 2.2 Frontend .dockerignore

```
node_modules
dist
.env
.env.local
npm-debug.log
.DS_Store
```

---

## Phase 3: Nginx Configuration

### 3.1 Development Nginx (`nginx/nginx.conf`)

```nginx
events {
    worker_connections 1024;
}

http {
    upstream backend {
        server backend:8000;
    }

    upstream frontend {
        server frontend:5173;
    }

    server {
        listen 80;
        client_max_body_size 2G;

        # Frontend (Vite dev server)
        location / {
            proxy_pass http://frontend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }

        # Backend API
        location /api {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # API docs
        location /docs {
            proxy_pass http://backend;
        }

        # Video streaming (static files)
        location /videos {
            alias /data/videos;
            add_header Accept-Ranges bytes;
            add_header Cache-Control "public, max-age=31536000";
        }

        # Thumbnails (static files)
        location /thumbnails {
            alias /data/thumbnails;
            add_header Cache-Control "public, max-age=31536000";
        }
    }
}
```

### 3.2 Production Nginx (`nginx/nginx.prod.conf`)

```nginx
events {
    worker_connections 1024;
}

http {
    upstream backend {
        server backend:8000;
    }

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript 
               application/x-javascript application/xml+rss 
               application/json application/javascript;

    server {
        listen 80;
        client_max_body_size 2G;

        # Frontend (built static files)
        root /usr/share/nginx/html;
        index index.html;

        # SPA routing
        location / {
            try_files $uri $uri/ /index.html;
        }

        # Backend API
        location /api {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # Timeouts for large uploads
            proxy_read_timeout 300s;
            proxy_connect_timeout 75s;
        }

        # API docs (optional in production)
        location /docs {
            proxy_pass http://backend;
        }

        # Video streaming
        location /videos {
            alias /data/videos;
            add_header Accept-Ranges bytes;
            add_header Cache-Control "public, max-age=31536000";
            
            # Enable byte-range support for video seeking
            sendfile on;
            sendfile_max_chunk 1m;
            tcp_nopush on;
        }

        # Thumbnails
        location /thumbnails {
            alias /data/thumbnails;
            add_header Cache-Control "public, max-age=31536000";
        }

        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
    }
}
```

---

## Phase 4: Docker Compose

### 4.1 Development Compose (`docker-compose.yml`)

```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    container_name: clipset-backend
    volumes:
      - ./backend:/app
      - ./data:/data
    environment:
      - DATABASE_URL=sqlite:////data/clipset.db
      - VIDEO_STORAGE_PATH=/data/videos
      - THUMBNAIL_STORAGE_PATH=/data/thumbnails
    env_file:
      - .env
    ports:
      - "8000:8000"
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: clipset-frontend
    volumes:
      - ./frontend:/app
      - /app/node_modules
    environment:
      - VITE_API_URL=http://localhost/api
    ports:
      - "5173:5173"
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    container_name: clipset-nginx
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./data/videos:/data/videos:ro
      - ./data/thumbnails:/data/thumbnails:ro
    ports:
      - "80:80"
    depends_on:
      - backend
      - frontend
    restart: unless-stopped

volumes:
  data:
```

### 4.2 Production Compose (`docker-compose.prod.yml`)

```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    container_name: clipset-backend
    volumes:
      - ./data:/data
    environment:
      - DATABASE_URL=sqlite:////data/clipset.db
      - VIDEO_STORAGE_PATH=/data/videos
      - THUMBNAIL_STORAGE_PATH=/data/thumbnails
    env_file:
      - .env
    restart: always
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.prod
    container_name: clipset-frontend
    restart: always

  nginx:
    image: nginx:alpine
    container_name: clipset-nginx
    volumes:
      - ./nginx/nginx.prod.conf:/etc/nginx/nginx.conf:ro
      - ./data/videos:/data/videos:ro
      - ./data/thumbnails:/data/thumbnails:ro
    ports:
      - "80:80"
    depends_on:
      - backend
      - frontend
    restart: always
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  data:
```

---

## Phase 5: Environment Configuration

### 5.1 .env.example

```env
# Database
DATABASE_URL=sqlite:////data/clipset.db

# Security
SECRET_KEY=change-me-to-a-random-secret-key-min-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=43200

# Storage Paths
VIDEO_STORAGE_PATH=/data/videos
THUMBNAIL_STORAGE_PATH=/data/thumbnails

# Upload Limits (bytes)
MAX_FILE_SIZE_BYTES=2147483648          # 2GB
WEEKLY_UPLOAD_LIMIT_BYTES=4294967296    # 4GB

# Accepted Video Formats (comma-separated)
ACCEPTED_VIDEO_FORMATS=mp4,mov,avi,mkv,webm

# FFmpeg
FFMPEG_PATH=/usr/bin/ffmpeg

# Quota Reset Schedule
QUOTA_RESET_DAY=0                       # 0 = Sunday
QUOTA_RESET_HOUR=0                      # Midnight
QUOTA_RESET_TIMEZONE=UTC

# Initial Admin User (created on first run)
INITIAL_ADMIN_EMAIL=admin@clipset.local
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=changeme123

# CORS (comma-separated origins)
BACKEND_CORS_ORIGINS=http://localhost,http://localhost:5173,http://localhost:3000

# Frontend API URL (for Docker)
VITE_API_URL=http://localhost/api
```

### 5.2 Security Notes

- Generate `SECRET_KEY` with: `openssl rand -hex 32`
- Change `INITIAL_ADMIN_PASSWORD` immediately after first login
- Never commit `.env` to version control

---

## Phase 6: PostgreSQL Migration (Optional)

### 6.1 PostgreSQL Compose Addition

Add to `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:15-alpine
    container_name: clipset-postgres
    environment:
      - POSTGRES_USER=clipset
      - POSTGRES_PASSWORD=clipset_password
      - POSTGRES_DB=clipset
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: always

volumes:
  postgres_data:
```

### 6.2 Update Backend Environment

```env
DATABASE_URL=postgresql+asyncpg://clipset:clipset_password@postgres:5432/clipset
```

### 6.3 Update Backend Requirements

```
# Replace aiosqlite with:
asyncpg==0.29.0
```

---

## Phase 7: Cloudflare Tunnel Setup

### 7.1 Install Cloudflared

On the host machine:
```bash
# Linux
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# Or via Docker (recommended)
docker pull cloudflare/cloudflared:latest
```

### 7.2 Authenticate

```bash
cloudflared tunnel login
```

### 7.3 Create Tunnel

```bash
cloudflared tunnel create clipset
# Save the tunnel ID and credentials file path
```

### 7.4 Configure Tunnel

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: clipset.yourdomain.com
    service: http://localhost:80
  - service: http_status:404
```

### 7.5 Route DNS

```bash
cloudflared tunnel route dns clipset clipset.yourdomain.com
```

### 7.6 Run Tunnel

```bash
# As service
cloudflared service install
sudo systemctl start cloudflared

# Or in Docker
docker run -d \
  --name cloudflared \
  --network host \
  -v ~/.cloudflared:/etc/cloudflared \
  cloudflare/cloudflared:latest \
  tunnel --config /etc/cloudflared/config.yml run
```

### 7.7 Update CORS

Add Cloudflare domain to `.env`:

```env
BACKEND_CORS_ORIGINS=http://localhost,https://clipset.yourdomain.com
```

---

## Phase 8: Deployment Commands

### 8.1 First-Time Setup

```bash
# Clone repository
git clone <repo_url> clipset
cd clipset

# Create .env from example
cp .env.example .env
# Edit .env with your values

# Create data directories
mkdir -p data/videos data/thumbnails

# Start services (development)
docker-compose up -d

# Or production
docker-compose -f docker-compose.prod.yml up -d

# Check logs
docker-compose logs -f
```

### 8.2 Updates

```bash
# Pull latest changes
git pull

# Rebuild containers
docker-compose down
docker-compose up -d --build

# Run migrations (if needed)
docker-compose exec backend alembic upgrade head
```

### 8.3 Backup

```bash
# Backup database
cp data/clipset.db backups/clipset-$(date +%Y%m%d).db

# Backup videos/thumbnails
tar -czf backups/media-$(date +%Y%m%d).tar.gz data/videos data/thumbnails
```

### 8.4 Restore

```bash
# Restore database
cp backups/clipset-20240120.db data/clipset.db

# Restore media
tar -xzf backups/media-20240120.tar.gz
```

---

## Phase 9: Monitoring & Maintenance

### 9.1 Container Health Checks

Add to Docker Compose services:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

### 9.2 Log Management

```bash
# View logs
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f nginx

# Log rotation configured in production compose
```

### 9.3 Storage Monitoring

```bash
# Check disk usage
df -h /path/to/data

# Check video storage
du -sh data/videos
```

### 9.4 Database Maintenance

```bash
# SQLite vacuum (optimize)
docker-compose exec backend sqlite3 /data/clipset.db "VACUUM;"

# PostgreSQL vacuum
docker-compose exec postgres vacuumdb -U clipset clipset
```

---

## Phase 10: Security Hardening

### 10.1 Firewall

```bash
# Allow only HTTP/HTTPS (if using Cloudflare Tunnel)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 10.2 SSL/TLS

If not using Cloudflare Tunnel:

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d clipset.yourdomain.com

# Auto-renewal
sudo systemctl enable certbot.timer
```

Update nginx to listen on 443 with SSL config.

### 10.3 Environment Security

- Store `.env` with restricted permissions: `chmod 600 .env`
- Use secrets management in production (Docker Secrets, Vault)
- Regularly rotate `SECRET_KEY` and admin passwords

---

## Phase 11: Scaling Considerations

### 11.1 External Storage

Replace local volumes with external drive:

```yaml
volumes:
  - /mnt/external-drive/videos:/data/videos
  - /mnt/external-drive/thumbnails:/data/thumbnails
```

### 11.2 Horizontal Scaling

For high traffic:
- Add load balancer
- Multiple backend replicas
- Shared storage (NFS, S3)
- PostgreSQL instead of SQLite

### 11.3 CDN Integration

- Serve videos/thumbnails via CDN
- Update API to return CDN URLs
- Configure Cloudflare to cache static assets

---

## Directory Permissions

Ensure Docker has write access:

```bash
sudo chown -R 1000:1000 data/
chmod -R 755 data/
```

---

## Testing Deployment

### Local Testing

1. Start services: `docker-compose up -d`
2. Access: http://localhost
3. Login with initial admin
4. Upload test video
5. Check processing
6. Test all features

### Production Testing

1. Deploy to server
2. Configure Cloudflare Tunnel
3. Access via domain
4. Test upload/playback over internet
5. Monitor logs and performance

---

## Troubleshooting

### Common Issues

**Backend won't start:**
- Check `.env` file exists and is valid
- Check database permissions
- View logs: `docker-compose logs backend`

**FFmpeg errors:**
- Ensure FFmpeg installed in container
- Check video format support
- Increase processing timeout

**Upload failures:**
- Check `client_max_body_size` in nginx
- Verify disk space
- Check file permissions

**Videos won't play:**
- Check video file exists in `/data/videos`
- Verify nginx volume mount
- Check browser console for errors

---

## Implementation Order

1. Phase 1-2: Create Dockerfiles
2. Phase 3: Nginx configurations
3. Phase 4: Docker Compose files
4. Phase 5: Environment configuration
5. Phase 8: Deploy and test locally
6. Phase 7: Set up Cloudflare Tunnel
7. Phase 9-10: Monitoring and security
8. Phase 6: Migrate to PostgreSQL (when needed)

---

## Success Criteria

- [ ] All services start successfully
- [ ] Frontend accessible via browser
- [ ] Admin can log in
- [ ] Videos upload and process
- [ ] Videos stream smoothly
- [ ] All API endpoints functional
- [ ] External access via Cloudflare Tunnel
- [ ] Data persists across container restarts

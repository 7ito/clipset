# HLS Streaming Implementation

This document describes the HTTP Live Streaming (HLS) implementation in Clipset, which provides better video seeking performance, especially in Firefox.

## Overview

HLS (HTTP Live Streaming) splits videos into small segments (typically 4 seconds each) with a manifest file (`.m3u8`) that lists all segments. This approach provides:

- **Instant seeking**: Jump to any point in the video without downloading everything before it
- **Better Firefox support**: Firefox has known issues with seeking in large MP4 files
- **Adaptive streaming ready**: The architecture supports future multi-bitrate streaming
- **Reduced memory usage**: Only loads segments as needed
- **Optimized performance**: Segments are served directly by nginx using signed URLs

## Architecture

### High-Performance Signed URL Architecture

Clipset uses nginx's `secure_link` module to serve HLS segments directly, bypassing Python for segment requests. This provides significant performance improvements, especially for mobile devices and when scrubbing through longer videos.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Request Flow                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  MANIFEST REQUEST (requires auth):                                   │
│  Client → Nginx → FastAPI → JWT Auth → Sign URLs → Return Manifest  │
│                                                                      │
│  SEGMENT REQUEST (direct nginx):                                     │
│  Client → Nginx → Validate Signature → sendfile() → Return Segment  │
│           ↑                                                          │
│           └── Python completely bypassed for segments                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Benefits:**
- Segments served with kernel-level `sendfile()` for optimal throughput
- No database queries or JWT validation per segment
- ~90% reduction in segment request latency
- Better scrubbing performance on mobile networks

### Storage Structure

When HLS is enabled, videos are stored as:

```
/data/uploads/videos/
├── {video-uuid}/              # HLS directory
│   ├── master.m3u8           # HLS manifest
│   ├── segment000.ts         # First 4-second segment
│   ├── segment001.ts         # Second segment
│   └── ...
└── {video-uuid}.mp4          # Original file (kept for fallback)
```

### Components

1. **Backend Video Processor** (`backend/app/services/video_processor.py`)
   - `transcode_video_hls()`: Transcodes video to HLS format using FFmpeg
   - Supports both GPU (NVENC) and CPU (libx264) encoding
   - Creates 4-second segments for optimal seeking granularity

2. **Backend API Endpoints** (`backend/app/api/videos.py`)
   - `GET /{short_id}/stream-info`: Returns video format (hls/progressive) and URLs
   - `GET /{short_id}/hls/master.m3u8`: Serves manifest with signed segment URLs (requires JWT auth)

3. **Nginx HLS Location** (`nginx/nginx.conf.template`)
   - `/hls/` location serves segments directly using `secure_link` validation
   - Validates time-limited signed URLs without involving Python

4. **Frontend Video Player** (`frontend/src/components/video-player/VideoPlayer.tsx`)
   - Uses [hls.js](https://github.com/video-dev/hls.js) for HLS playback in Chrome/Firefox
   - Falls back to native HLS in Safari
   - Automatically refetches manifest if segment URLs expire (410 response)
   - Falls back to progressive MP4 if HLS fails

5. **Migration Service** (`backend/app/services/background_tasks.py`)
   - Automatically converts existing videos to HLS on server startup
   - Runs in background without blocking the application

## Configuration

### Enabling HLS

1. Go to **Admin > Settings**
2. Scroll to **Video Delivery Format**
3. Select **HLS - Segmented Streaming (Recommended)**
4. Click **Save Changes**

New uploads will automatically use HLS format. Existing videos will be migrated in the background.

### HLS Signing Secret

The `HLS_SIGNING_SECRET` is used to sign segment URLs for nginx validation. Configuration:

1. **Automatic (recommended for development)**: If not set, derived from `SECRET_KEY`
2. **Explicit (recommended for production)**: Set in `.env` file

```bash
# Generate a signing secret
openssl rand -hex 16

# Add to .env
HLS_SIGNING_SECRET=your-generated-secret
```

**Important**: The same secret must be available to both the backend and nginx. The docker-compose configuration handles this automatically via environment variable injection.

### Database Configuration

The `video_output_format` setting is stored in the `config` table:
- `"hls"` - Use HLS segmented streaming (default)
- `"progressive"` - Use single MP4 file

## Deployment

### Prerequisites

- FFmpeg with HLS support (included in all Clipset Docker images)
- Sufficient disk space for HLS segments (approximately same size as source)
- nginx with `ngx_http_secure_link_module` (included in standard nginx)

### Production Deployment Steps

1. **Update the application**
   ```bash
   git pull origin main
   ```

2. **Set HLS signing secret** (if not already set)
   ```bash
   # Generate and add to .env
   echo "HLS_SIGNING_SECRET=$(openssl rand -hex 16)" >> .env
   ```

3. **Run database migrations**
   ```bash
   docker-compose exec backend alembic upgrade head
   ```

4. **Restart all services** (nginx needs the new config template)
   ```bash
   docker-compose down && docker-compose up -d
   ```
   
   On restart:
   - nginx will load the new configuration with signed URL validation
   - Backend will check if HLS is enabled in settings
   - Existing videos will be migrated to HLS format in the background

5. **Verify HLS is working**
   - Check migration status: `GET /api/config/hls-migration-status`
   - Play a video and check browser Network tab:
     - Manifest: `GET /api/videos/{id}/hls/master.m3u8?token=...`
     - Segments: `GET /hls/{uuid}/segment000.ts?md5=...&expires=...`

### Docker Compose Configuration

The docker-compose files are configured to:
- Use nginx config templates (`.template` files)
- Inject `HLS_SIGNING_SECRET` via `envsubst`
- Mount video storage for direct nginx access

### Nginx Configuration

The nginx configuration includes:

```nginx
# HLS segments with signed URL validation
location /hls/ {
    secure_link $arg_md5,$arg_expires;
    secure_link_md5 "$secure_link_expires$uri${HLS_SIGNING_SECRET}";

    if ($secure_link = "") { return 403; }  # Invalid signature
    if ($secure_link = "0") { return 410; } # Expired

    alias /data/uploads/videos/;
    sendfile on;
    # ... additional optimizations
}
```

### Monitoring Migration Progress

Check migration status via the API:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/config/hls-migration-status
```

Response:
```json
{
  "is_running": false,
  "total": 100,
  "completed": 100,
  "current_video": null,
  "errors": []
}
```

## Troubleshooting

### Videos not playing with HLS

1. **Check stream-info endpoint**
   ```bash
   curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:8000/api/videos/{short_id}/stream-info
   ```
   
   Should return `"format": "hls"` and `"ready": true`

2. **Check HLS manifest exists**
   ```bash
   ls /data/uploads/videos/{video-uuid}/master.m3u8
   ```

3. **Check browser console** for HLS.js errors

### 403 Forbidden on segment requests

This indicates the signed URL signature is invalid:

1. **Check HLS_SIGNING_SECRET matches** between backend and nginx
   ```bash
   # Check backend config
   docker-compose exec backend python -c "from app.config import settings; print(settings.hls_signing_secret)"
   
   # Check nginx received the secret
   docker-compose exec nginx printenv HLS_SIGNING_SECRET
   ```

2. **Restart nginx** to pick up configuration changes
   ```bash
   docker-compose restart nginx
   ```

### 410 Gone on segment requests

This indicates the signed URL has expired (default: 12 hours):

1. **Normal behavior**: The frontend automatically refetches the manifest to get fresh URLs
2. **Check browser console** - should see "refetching manifest" message
3. **If persistent**: Check system clock sync between servers

### Migration errors

Check backend logs:
```bash
docker-compose logs backend | grep -i "hls\|migrate"
```

Common issues:
- **"File exists" error**: The migration tried to create a directory with the same name as an existing file. This was fixed in the latest version.
- **FFmpeg errors**: Check if FFmpeg has HLS support: `ffmpeg -formats | grep hls`

### Falling back to progressive

If HLS fails, the player automatically falls back to progressive MP4. Check:
1. Browser console for error messages
2. Network tab for failed requests
3. Backend logs for transcoding errors

## Performance Considerations

### Signed URL Expiry

- **Segment URLs expire after 12 hours** by default
- **Manifest is cached for 1 hour** by the browser
- If a user leaves a tab open for 12+ hours, segment requests will return 410
- The frontend automatically refetches the manifest to get fresh URLs

### Disk Space

HLS segments use approximately the same space as the original transcoded video. The original uploaded file is kept for potential re-transcoding.

To save space, you can delete original files after successful HLS conversion by uncommenting line 321 in `backend/app/services/background_tasks.py`:
```python
# storage.delete_file(source_path)
```

### Transcoding Time

HLS transcoding takes approximately the same time as progressive transcoding. GPU acceleration (NVENC) significantly speeds up the process.

### Network Performance

With signed URLs:
- **Manifest request**: ~20-50ms (involves Python + DB)
- **Segment request**: ~2-5ms (nginx direct, no Python)
- **Improvement**: ~90% faster segment delivery

This is especially noticeable when:
- Scrubbing through long videos (many segment requests)
- Playing on mobile networks (latency-sensitive)
- Multiple concurrent viewers

## API Reference

### GET /api/videos/{short_id}/stream-info

Returns information about how to stream the video.

**Response (HLS ready)**:
```json
{
  "format": "hls",
  "manifest_url": "/api/videos/{short_id}/hls/master.m3u8",
  "ready": true
}
```

**Response (Progressive)**:
```json
{
  "format": "progressive",
  "stream_url": "/api/videos/{short_id}/stream",
  "ready": true
}
```

### GET /api/videos/{short_id}/hls/master.m3u8

Serves the HLS manifest with signed segment URLs. Requires authentication via `token` query parameter.

**Request**:
```
GET /api/videos/{short_id}/hls/master.m3u8?token={jwt}
```

**Response**: M3U8 manifest with signed segment URLs:
```m3u8
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:4
#EXTINF:4.000000,
/hls/{video-uuid}/segment000.ts?md5=abc123&expires=1234567890
#EXTINF:4.000000,
/hls/{video-uuid}/segment001.ts?md5=def456&expires=1234567890
...
```

### GET /hls/{path}

Nginx-served endpoint for HLS segments. Requires valid signed URL parameters.

**Request**:
```
GET /hls/{video-uuid}/segment000.ts?md5={signature}&expires={timestamp}
```

**Response codes**:
- `200`: Success, returns segment data
- `403`: Invalid signature
- `410`: Valid signature but expired

### GET /api/config/hls-migration-status

Returns the status of background HLS migration (admin only).

**Response**:
```json
{
  "is_running": boolean,
  "total": number,
  "completed": number,
  "current_video": string | null,
  "errors": string[]
}
```

## Security Considerations

### Signed URL Security

- URLs are signed with HMAC-MD5 (nginx `secure_link` standard)
- Signatures include: expiry timestamp + URI + secret
- URLs cannot be tampered with or extended
- Each segment has its own signature

### Access Control

- **Manifest requests**: Require valid JWT (same as before)
- **Segment requests**: Require valid signed URL from manifest
- **Indirect access control**: Users can only access segments if they can access the manifest
- **Time-limited**: URLs expire after 12 hours regardless of JWT validity

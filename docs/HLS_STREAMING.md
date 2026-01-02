# HLS Streaming Implementation

This document describes the HTTP Live Streaming (HLS) implementation in Clipset, which provides better video seeking performance, especially in Firefox.

## Overview

HLS (HTTP Live Streaming) splits videos into small segments (typically 4 seconds each) with a manifest file (`.m3u8`) that lists all segments. This approach provides:

- **Instant seeking**: Jump to any point in the video without downloading everything before it
- **Better Firefox support**: Firefox has known issues with seeking in large MP4 files
- **Adaptive streaming ready**: The architecture supports future multi-bitrate streaming
- **Reduced memory usage**: Only loads segments as needed

## Architecture

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
   - `GET /{short_id}/hls/{filename}`: Serves HLS manifest and segment files

3. **Frontend Video Player** (`frontend/src/components/video-player/VideoPlayer.tsx`)
   - Uses [hls.js](https://github.com/video-dev/hls.js) for HLS playback in Chrome/Firefox
   - Falls back to native HLS in Safari
   - Automatically falls back to progressive MP4 if HLS fails

4. **Migration Service** (`backend/app/services/background_tasks.py`)
   - Automatically converts existing videos to HLS on server startup
   - Runs in background without blocking the application

## Configuration

### Enabling HLS

1. Go to **Admin > Settings**
2. Scroll to **Video Delivery Format**
3. Select **HLS - Segmented Streaming (Recommended)**
4. Click **Save Changes**

New uploads will automatically use HLS format. Existing videos will be migrated in the background.

### Database Configuration

The `video_output_format` setting is stored in the `config` table:
- `"hls"` - Use HLS segmented streaming (default)
- `"progressive"` - Use single MP4 file

## Deployment

### Prerequisites

- FFmpeg with HLS support (included in all Clipset Docker images)
- Sufficient disk space for HLS segments (approximately same size as source)

### Production Deployment Steps

1. **Update the application**
   ```bash
   git pull origin main
   ```

2. **Run database migrations**
   ```bash
   docker-compose exec backend alembic upgrade head
   ```

3. **Restart the backend service**
   ```bash
   docker-compose restart backend
   ```
   
   On restart, the backend will:
   - Check if HLS is enabled in settings
   - Automatically migrate existing videos to HLS format
   - This runs in the background and may take time for large libraries

4. **Rebuild frontend** (if not using dev mode)
   ```bash
   docker-compose exec frontend npm run build
   ```

5. **Verify HLS is working**
   - Check migration status: `GET /api/config/hls-migration-status`
   - Play a video and check browser Network tab for `.m3u8` and `.ts` requests

### Docker Compose Changes

No changes to `docker-compose.yml` are required. The existing volume mounts for `/data/uploads/videos` will contain both HLS directories and original MP4 files.

### Nginx Configuration

The existing nginx configuration already handles HLS files correctly through the API proxy. No changes needed.

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

### Disk Space

HLS segments use approximately the same space as the original transcoded video. The original uploaded file is kept for potential re-transcoding.

To save space, you can delete original files after successful HLS conversion by uncommenting line 321 in `backend/app/services/background_tasks.py`:
```python
# storage.delete_file(source_path)
```

### Transcoding Time

HLS transcoding takes approximately the same time as progressive transcoding. GPU acceleration (NVENC) significantly speeds up the process.

### Network Bandwidth

HLS may use slightly more bandwidth due to:
- Manifest requests
- Segment overhead
- Potential duplicate segment downloads during seeking

However, the improved seeking experience typically outweighs this cost.

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

### GET /api/videos/{short_id}/hls/{filename}

Serves HLS files (manifest and segments). Requires authentication via `token` query parameter.

**Examples**:
- Manifest: `GET /api/videos/{short_id}/hls/master.m3u8?token={jwt}`
- Segment: `GET /api/videos/{short_id}/hls/segment000.ts?token={jwt}`

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

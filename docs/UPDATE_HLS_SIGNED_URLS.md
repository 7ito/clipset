# Update: HLS Signed URLs for Improved Streaming Performance

This update implements nginx `secure_link` signed URLs for HLS segment delivery, significantly improving video playback performance, especially on mobile networks and when scrubbing through longer videos.

## What Changed

- **HLS segments are now served directly by nginx** instead of being proxied through Python/FastAPI
- Segment URLs are signed with time-limited tokens (12-hour expiry)
- nginx validates signatures using its `secure_link` module
- Frontend automatically refetches manifest if segment URLs expire

## Performance Improvement

| Metric | Before | After |
|--------|--------|-------|
| Segment request latency | ~50-100ms | ~2-5ms |
| Python requests per 30-min video | 451 | 1 (manifest only) |
| Scrubbing responsiveness | Poor on mobile | Excellent |

## Update Steps

### 1. Pull the latest code

```bash
cd /path/to/clipset
git pull origin main
```

### 2. Generate HLS Signing Secret

Generate a random secret and add it to your `.env` file:

```bash
# Generate secret
echo "HLS_SIGNING_SECRET=$(openssl rand -hex 16)" >> .env

# Verify it was added
grep HLS_SIGNING_SECRET .env
```

**Important**: If you don't set `HLS_SIGNING_SECRET`, the backend will automatically derive one from your `SECRET_KEY`. However, for production, explicitly setting it is recommended.

### 3. Stop all services

```bash
docker-compose -f docker-compose.prod.yml down
```

### 4. Verify the new nginx config template exists

```bash
ls -la nginx/nginx.prod.conf.template
```

You should see the new template file. The old `nginx.prod.conf` is no longer used directly.

### 5. Start all services

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### 6. Verify nginx configuration was applied

```bash
# Check nginx is running
docker-compose -f docker-compose.prod.yml ps

# Verify the HLS location block exists in the generated config
docker-compose -f docker-compose.prod.yml exec nginx cat /etc/nginx/nginx.conf | grep -A 5 "location /hls/"
```

You should see:
```nginx
location /hls/ {
    secure_link $arg_md5,$arg_expires;
    secure_link_md5 "$secure_link_expires$uri <your-secret>";
    ...
```

### 7. Test video playback

1. Open the application in a browser
2. Play a video
3. Open browser DevTools → Network tab
4. Verify you see:
   - Manifest request: `GET /api/videos/{id}/hls/master.m3u8?token=...` → 200
   - Segment requests: `GET /hls/{uuid}/segment*.ts?md5=...&expires=...` → 200

### 8. Verify security

Test that invalid signatures are rejected:

```bash
# Should return 403 (invalid signature)
curl -s -o /dev/null -w "%{http_code}" "http://your-domain/hls/test/segment.ts?md5=INVALID&expires=9999999999"
```

## Rollback Procedure

If you need to rollback:

1. Restore the old nginx config:
   ```bash
   # Create a simple nginx.conf that proxies everything through the backend
   # Or checkout the previous git commit
   git checkout HEAD~1 -- nginx/ docker-compose.prod.yml
   ```

2. Remove the HLS_SIGNING_SECRET from `.env` (optional)

3. Restart services:
   ```bash
   docker-compose -f docker-compose.prod.yml down
   docker-compose -f docker-compose.prod.yml up -d
   ```

## Troubleshooting

### Segments returning 403 Forbidden

The signing secret doesn't match between backend and nginx:

```bash
# Check backend secret
docker-compose -f docker-compose.prod.yml exec backend python -c "from app.config import settings; print(settings.hls_signing_secret)"

# Check nginx received the secret
docker-compose -f docker-compose.prod.yml exec nginx printenv HLS_SIGNING_SECRET
```

Both should output the same value. If not, ensure `HLS_SIGNING_SECRET` is set in your `.env` file and restart all services.

### Segments returning 410 Gone

This means the signed URL has expired. This is normal if:
- User left the tab open for 12+ hours
- System clocks are out of sync

The frontend automatically handles this by refetching the manifest.

### nginx failing to start

Check the logs:
```bash
docker-compose -f docker-compose.prod.yml logs nginx
```

Common issues:
- Missing `HLS_SIGNING_SECRET` environment variable
- Syntax error in template file

## Configuration Reference

| Setting | Default | Description |
|---------|---------|-------------|
| `HLS_SIGNING_SECRET` | Derived from `SECRET_KEY` | Secret for signing segment URLs |
| Segment URL expiry | 12 hours | How long signed URLs are valid |
| Manifest cache | 1 hour | Browser cache time for manifests |

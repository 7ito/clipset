# Transcoding Settings Feature

This document describes the configurable transcoding settings feature added to Clipset.

## Overview

Clipset now supports configurable video transcoding settings through the admin panel. This allows administrators to:

- Choose between preset modes (Quality, Balanced, Performance) or Custom mode
- Enable/disable GPU (NVENC) transcoding with automatic detection
- Fine-tune NVENC and CPU encoding parameters
- Set maximum output resolution (720p, 1080p, 1440p, 4K)
- Configure audio bitrate

## Applying Changes to Production

### 1. Database Migration

The feature requires a database migration to add new columns to the `config` table.

**For Docker deployments:**
```bash
docker compose exec backend alembic upgrade head
```

**For non-Docker deployments:**
```bash
cd backend
alembic upgrade head
```

### 2. Restart Services

After the migration, restart the backend service to load the new code:

**Docker:**
```bash
docker compose restart backend
```

**Non-Docker:**
```bash
# Restart your backend process (uvicorn, gunicorn, etc.)
```

### 3. Rebuild Frontend (if not using dev mode)

If running in production with pre-built frontend assets:

```bash
cd frontend
npm run build
```

Then deploy the new `dist/` folder to your web server.

## New API Endpoints

### GET /api/config/encoders
Returns available video encoders on the system.

**Response:**
```json
{
  "gpu_available": true,
  "gpu_name": "NVIDIA GeForce RTX 3060",
  "encoders": ["h264_nvenc", "hevc_nvenc", "libx264"]
}
```

### GET /api/config/ (updated)
Now includes transcoding settings in the response.

### PATCH /api/config/ (updated)
Accepts new transcoding-related fields.

## New Configuration Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `use_gpu_transcoding` | boolean | `false` | Enable NVENC GPU transcoding |
| `gpu_device_id` | integer | `0` | GPU device index |
| `nvenc_preset` | string | `"p4"` | NVENC preset (p1-p7) |
| `nvenc_cq` | integer | `18` | NVENC constant quality (0-51) |
| `nvenc_rate_control` | string | `"vbr"` | Rate control mode |
| `nvenc_max_bitrate` | string | `"8M"` | Maximum bitrate cap |
| `nvenc_buffer_size` | string | `"16M"` | Buffer size |
| `cpu_preset` | string | `"medium"` | x264 CPU preset |
| `cpu_crf` | integer | `18` | x264 constant rate factor |
| `max_resolution` | string | `"1080p"` | Max output resolution |
| `audio_bitrate` | string | `"192k"` | Audio bitrate |
| `transcode_preset_mode` | string | `"balanced"` | Preset mode |

## Preset Values

### Quality
- Best quality, larger files, slower encoding
- NVENC: p6, CQ 16, 15M bitrate
- CPU: slow, CRF 16
- Resolution: 4K
- Audio: 256k

### Balanced (Default)
- Good balance of quality, size, and speed
- NVENC: p4, CQ 18, 8M bitrate
- CPU: medium, CRF 18
- Resolution: 1080p
- Audio: 192k

### Performance
- Faster encoding, smaller files
- NVENC: p2, CQ 23, 5M bitrate
- CPU: fast, CRF 23
- Resolution: 1080p
- Audio: 128k

## Recommended Settings for Common Hardware

### NVIDIA RTX 3060 (Laptop)
- Mode: Custom
- GPU: Enabled
- NVENC Preset: p5 (thermal management)
- CQ: 16
- Max Bitrate: 12M
- Resolution: 1440p

### NVIDIA RTX 4070/4080/4090
- Mode: Quality or Custom
- GPU: Enabled
- NVENC Preset: p6 or p7
- CQ: 14-16
- Max Bitrate: 15-20M
- Resolution: 4K

### CPU-only (no NVIDIA GPU)
- Mode: Balanced
- GPU: Disabled
- CPU Preset: medium
- CRF: 18
- Resolution: 1080p

## Validation Rules

- GPU transcoding cannot be saved if no GPU encoder is detected
- NVENC preset must be p1-p7
- CQ/CRF must be 0-51
- Resolution must be one of: 720p, 1080p, 1440p, 4k
- Bitrate must match pattern (e.g., "8M", "15M")

## Rollback

To rollback the migration:

```bash
# Docker
docker compose exec backend alembic downgrade 8bfb4401e6ef

# Non-Docker
cd backend && alembic downgrade 8bfb4401e6ef
```

Note: This will remove all transcoding settings from the database.

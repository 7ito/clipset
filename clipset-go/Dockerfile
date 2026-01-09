# Clipset Go Backend - Multi-stage Dockerfile
# Stage 1: Build the Go binary
# Stage 2: Minimal runtime with FFmpeg

# ============================================
# Stage 1: Build
# ============================================
FROM golang:1.22-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git ca-certificates tzdata

# Set working directory
WORKDIR /build

# Copy go mod files first for better caching
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the binary
# - CGO_ENABLED=0 for static binary
# - ldflags to reduce binary size
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s -X main.Version=1.0.0" \
    -o clipset \
    ./cmd/clipset

# ============================================
# Stage 2: Runtime
# ============================================
FROM alpine:3.19

# Install runtime dependencies
# - FFmpeg for video processing
# - ca-certificates for HTTPS
# - tzdata for timezone support
RUN apk add --no-cache \
    ffmpeg \
    ca-certificates \
    tzdata \
    curl

# Create non-root user for security
RUN addgroup -g 1000 clipset && \
    adduser -u 1000 -G clipset -s /bin/sh -D clipset

# Create data directories
RUN mkdir -p /data/uploads/videos \
             /data/uploads/thumbnails \
             /data/uploads/temp \
             /data/uploads/chunks \
             /data/uploads/category-images \
             /data/uploads/avatars && \
    chown -R clipset:clipset /data

# Copy binary from builder
COPY --from=builder /build/clipset /usr/local/bin/clipset

# Copy migrations (embedded in binary, but keep for reference)
# COPY --from=builder /build/internal/db/migrations /app/migrations

# Set working directory
WORKDIR /app

# Switch to non-root user
USER clipset

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Default environment variables
ENV HOST=0.0.0.0 \
    PORT=8000 \
    VIDEO_STORAGE_PATH=/data/uploads/videos \
    THUMBNAIL_STORAGE_PATH=/data/uploads/thumbnails \
    TEMP_STORAGE_PATH=/data/uploads/temp \
    CHUNKS_STORAGE_PATH=/data/uploads/chunks \
    CATEGORY_IMAGE_STORAGE_PATH=/data/uploads/category-images \
    AVATAR_STORAGE_PATH=/data/uploads/avatars

# Run the server
# Note: Database migrations run automatically on startup
CMD ["clipset"]

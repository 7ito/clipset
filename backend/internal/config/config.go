package config

import (
	"fmt"
	"strings"
	"time"

	"github.com/caarlos0/env/v11"
)

// Config holds all application configuration
type Config struct {
	// Server settings
	Host string `env:"HOST" envDefault:"0.0.0.0"`
	Port int    `env:"PORT" envDefault:"8000"`

	// Database
	DatabaseURL string `env:"DATABASE_URL,required"`

	// JWT settings
	JWTSecret      string        `env:"JWT_SECRET,required"`
	JWTExpiryHours time.Duration `env:"JWT_EXPIRY_HOURS" envDefault:"720h"` // 30 days

	// Storage paths
	VideoStoragePath         string `env:"VIDEO_STORAGE_PATH" envDefault:"./data/uploads/videos"`
	ThumbnailStoragePath     string `env:"THUMBNAIL_STORAGE_PATH" envDefault:"./data/uploads/thumbnails"`
	TempStoragePath          string `env:"TEMP_STORAGE_PATH" envDefault:"./data/uploads/temp"`
	ChunksStoragePath        string `env:"CHUNKS_STORAGE_PATH" envDefault:"./data/uploads/chunks"`
	CategoryImageStoragePath string `env:"CATEGORY_IMAGE_STORAGE_PATH" envDefault:"./data/uploads/category-images"`
	AvatarStoragePath        string `env:"AVATAR_STORAGE_PATH" envDefault:"./data/uploads/avatars"`

	// Initial admin credentials (for first startup)
	InitialAdminEmail    string `env:"INITIAL_ADMIN_EMAIL" envDefault:"admin@example.com"`
	InitialAdminUsername string `env:"INITIAL_ADMIN_USERNAME" envDefault:"admin"`
	InitialAdminPassword string `env:"INITIAL_ADMIN_PASSWORD" envDefault:"changeme"`

	// HLS signing (required for secure video streaming)
	HLSSigningSecret string `env:"HLS_SIGNING_SECRET,required"`

	// Streaming settings
	StreamChunkSize int `env:"STREAM_CHUNK_SIZE_BYTES" envDefault:"65536"` // 64KB default

	// CORS
	CORSOrigins []string `env:"CORS_ORIGINS" envSeparator:"," envDefault:"http://localhost:5173,http://localhost:3000"`

	// Frontend URL (for password reset links, etc.)
	FrontendBaseURL string `env:"FRONTEND_BASE_URL" envDefault:"http://localhost:5173"`

	// Avatar settings
	MaxAvatarSizeBytes int64 `env:"MAX_AVATAR_SIZE_BYTES" envDefault:"2097152"` // 2MB
	AvatarImageSize    int   `env:"AVATAR_IMAGE_SIZE" envDefault:"256"`         // Square dimensions

	// Category image settings
	MaxCategoryImageSizeBytes int64 `env:"MAX_CATEGORY_IMAGE_SIZE_BYTES" envDefault:"5242880"` // 5MB
	CategoryImageSize         int   `env:"CATEGORY_IMAGE_SIZE" envDefault:"400"`               // Square dimensions

	// Video upload settings (fallback defaults - actual limits come from DB config)
	AcceptedVideoFormats []string `env:"ACCEPTED_VIDEO_FORMATS" envSeparator:"," envDefault:"mp4,mov,avi,mkv,webm,m4v"`
	MaxFileSizeBytes     int64    `env:"MAX_FILE_SIZE_BYTES" envDefault:"2147483648"`       // 2GB fallback
	WeeklyUploadLimit    int64    `env:"WEEKLY_UPLOAD_LIMIT_BYTES" envDefault:"4294967296"` // 4GB fallback

	// FFmpeg settings
	FFmpegPath             string        `env:"FFMPEG_PATH" envDefault:"ffmpeg"`
	FFprobePath            string        `env:"FFPROBE_PATH" envDefault:"ffprobe"`
	VideoProcessingTimeout time.Duration `env:"VIDEO_PROCESSING_TIMEOUT" envDefault:"2h"`

	// Environment
	Environment string `env:"ENVIRONMENT" envDefault:"development"`

	// HTTP Server Timeouts
	HTTPReadTimeout  time.Duration `env:"HTTP_READ_TIMEOUT" envDefault:"10m"`  // For large uploads
	HTTPWriteTimeout time.Duration `env:"HTTP_WRITE_TIMEOUT" envDefault:"5m"`  // For video streaming
	HTTPIdleTimeout  time.Duration `env:"HTTP_IDLE_TIMEOUT" envDefault:"120s"` // Keep-alive
}

// Load reads configuration from environment variables
func Load() (*Config, error) {
	cfg := &Config{}
	if err := env.Parse(cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config: %w", err)
	}

	// Validate required fields
	if len(cfg.JWTSecret) < 32 {
		return nil, fmt.Errorf("JWT_SECRET must be at least 32 characters")
	}

	if len(cfg.HLSSigningSecret) < 16 {
		return nil, fmt.Errorf("HLS_SIGNING_SECRET must be at least 16 characters")
	}

	// Validate stream chunk size (minimum 8KB, maximum 1MB)
	if cfg.StreamChunkSize < 8192 {
		cfg.StreamChunkSize = 8192
	} else if cfg.StreamChunkSize > 1048576 {
		cfg.StreamChunkSize = 1048576
	}

	return cfg, nil
}

// Address returns the server address
func (c *Config) Address() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

// IsDevelopment returns true if running in development mode
func (c *Config) IsDevelopment() bool {
	return c.Environment == "development"
}

// IsProduction returns true if running in production mode
func (c *Config) IsProduction() bool {
	return c.Environment == "production"
}

// IsAcceptedVideoFormat checks if the extension is in the accepted list
func (c *Config) IsAcceptedVideoFormat(ext string) bool {
	ext = strings.ToLower(strings.TrimPrefix(ext, "."))
	for _, accepted := range c.AcceptedVideoFormats {
		if strings.ToLower(accepted) == ext {
			return true
		}
	}
	return false
}

// AcceptedFormatsString returns comma-separated accepted formats for error messages
func (c *Config) AcceptedFormatsString() string {
	return strings.Join(c.AcceptedVideoFormats, ", ")
}

package config

import (
	"fmt"
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

	// HLS signing
	HLSSigningSecret string `env:"HLS_SIGNING_SECRET" envDefault:""`

	// CORS
	CORSOrigins []string `env:"CORS_ORIGINS" envSeparator:"," envDefault:"http://localhost:5173,http://localhost:3000"`

	// Environment
	Environment string `env:"ENVIRONMENT" envDefault:"development"`
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

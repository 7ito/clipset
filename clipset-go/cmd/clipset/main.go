package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/clipset/clipset-go/internal/api"
	"github.com/clipset/clipset-go/internal/config"
	"github.com/clipset/clipset-go/internal/db"
	"github.com/clipset/clipset-go/internal/worker"
)

func main() {
	// Check for subcommands
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "migrate":
			runMigrate()
			return
		case "version":
			fmt.Println("Clipset v1.0.0")
			return
		case "help":
			printHelp()
			return
		}
	}

	// Run the server
	if err := run(); err != nil {
		log.Fatalf("Error: %v", err)
	}
}

func run() error {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	// Create context that listens for shutdown signals
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Run database migrations
	log.Println("Running database migrations...")
	if err := db.RunMigrations(cfg.DatabaseURL); err != nil {
		return fmt.Errorf("failed to run migrations: %w", err)
	}
	log.Println("Migrations completed")

	// Connect to database
	log.Println("Connecting to database...")
	database, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}
	defer database.Close()
	log.Println("Database connected")

	// Create router
	router := api.NewRouter(database, cfg)

	// Create and start background worker
	log.Println("Starting background worker...")
	bgWorker, err := worker.New(worker.Config{
		Database:  database,
		Pool:      database.Pool,
		AppConfig: cfg,
	})
	if err != nil {
		return fmt.Errorf("failed to create worker: %w", err)
	}

	if err := bgWorker.Start(ctx); err != nil {
		return fmt.Errorf("failed to start worker: %w", err)
	}

	// Wire up the enqueue function to the videos handler
	router.VideosHandler().SetEnqueueFunc(bgWorker.EnqueueTranscode)
	log.Println("Background worker started")

	// Create HTTP server
	server := &http.Server{
		Addr:         cfg.Address(),
		Handler:      router.Handler(),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Channel to listen for errors from server
	serverErrors := make(chan error, 1)

	// Start server in goroutine
	go func() {
		log.Printf("Server starting on %s", cfg.Address())
		serverErrors <- server.ListenAndServe()
	}()

	// Channel to listen for shutdown signals
	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, os.Interrupt, syscall.SIGTERM)

	// Block until we receive a signal or server error
	select {
	case err := <-serverErrors:
		if err != http.ErrServerClosed {
			return fmt.Errorf("server error: %w", err)
		}
	case sig := <-shutdown:
		log.Printf("Received signal %v, shutting down...", sig)

		// Create deadline context for shutdown
		shutdownCtx, shutdownCancel := context.WithTimeout(ctx, 30*time.Second)
		defer shutdownCancel()

		// Stop background worker first
		if err := bgWorker.Stop(shutdownCtx); err != nil {
			log.Printf("Warning: failed to stop worker gracefully: %v", err)
		}

		// Attempt graceful shutdown
		if err := server.Shutdown(shutdownCtx); err != nil {
			// Force close if graceful shutdown fails
			server.Close()
			return fmt.Errorf("failed to shutdown gracefully: %w", err)
		}
	}

	log.Println("Server stopped")
	return nil
}

func runMigrate() {
	// This will be expanded for SQLite migration tool
	fmt.Println("Migration subcommand - to be implemented")
	fmt.Println("Usage: clipset migrate --sqlite-path <path> --postgres-url <url>")
}

func printHelp() {
	fmt.Println(`Clipset - Video sharing platform

Usage:
  clipset [command]

Commands:
  (none)     Start the HTTP server
  migrate    Run SQLite to PostgreSQL migration
  version    Show version information
  help       Show this help message

Environment Variables:
  DATABASE_URL                PostgreSQL connection URL (required)
  JWT_SECRET                  JWT signing secret, min 32 chars (required)
  PORT                        Server port (default: 8000)
  HOST                        Server host (default: 0.0.0.0)
  VIDEO_STORAGE_PATH          Video storage directory
  THUMBNAIL_STORAGE_PATH      Thumbnail storage directory
  TEMP_STORAGE_PATH           Temporary file storage directory
  CHUNKS_STORAGE_PATH         Chunked upload storage directory
  CATEGORY_IMAGE_STORAGE_PATH Category image storage directory
  AVATAR_STORAGE_PATH         User avatar storage directory
  INITIAL_ADMIN_EMAIL         Initial admin email
  INITIAL_ADMIN_USERNAME      Initial admin username
  INITIAL_ADMIN_PASSWORD      Initial admin password
  HLS_SIGNING_SECRET          Secret for HLS URL signing
  CORS_ORIGINS                Comma-separated list of allowed origins
  ENVIRONMENT                 Environment (development/production)
  FFMPEG_PATH                 Path to FFmpeg binary (default: ffmpeg)
  FFPROBE_PATH                Path to FFprobe binary (default: ffprobe)
  VIDEO_PROCESSING_TIMEOUT    Timeout for video processing (default: 2h)
`)
}

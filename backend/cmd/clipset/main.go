package main

import (
	"context"
	"flag"
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
	"github.com/clipset/clipset-go/internal/migrate"
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
		ReadTimeout:  cfg.HTTPReadTimeout,
		WriteTimeout: cfg.HTTPWriteTimeout,
		IdleTimeout:  cfg.HTTPIdleTimeout,
	}
	log.Printf("HTTP timeouts: read=%v, write=%v, idle=%v", cfg.HTTPReadTimeout, cfg.HTTPWriteTimeout, cfg.HTTPIdleTimeout)

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
	// Parse migration flags
	flags := flag.NewFlagSet("migrate", flag.ExitOnError)

	var sqlitePath string
	var postgresURL string
	var dryRun bool
	var batchSize int

	flags.StringVar(&sqlitePath, "sqlite-path", "", "Path to SQLite database (required)")
	flags.StringVar(&postgresURL, "postgres-url", "", "PostgreSQL connection URL (required)")
	flags.BoolVar(&dryRun, "dry-run", false, "Show what would be migrated without making changes")
	flags.IntVar(&batchSize, "batch-size", migrate.DefaultBatchSize, "Number of rows per batch")

	flags.Usage = func() {
		fmt.Println("Usage: clipset migrate [options]")
		fmt.Println()
		fmt.Println("Migrate data from SQLite (Python backend) to PostgreSQL (Go backend)")
		fmt.Println()
		fmt.Println("Options:")
		flags.PrintDefaults()
		fmt.Println()
		fmt.Println("Example:")
		fmt.Println("  clipset migrate --sqlite-path /data/clipset.db --postgres-url postgres://user:pass@localhost:5432/clipset")
		fmt.Println()
		fmt.Println("Note: Run the Go server first to apply PostgreSQL schema migrations,")
		fmt.Println("      then stop it and run this migration command.")
	}

	if err := flags.Parse(os.Args[2:]); err != nil {
		os.Exit(1)
	}

	// Validate required flags
	if sqlitePath == "" {
		fmt.Println("Error: --sqlite-path is required")
		fmt.Println()
		flags.Usage()
		os.Exit(1)
	}

	if postgresURL == "" {
		fmt.Println("Error: --postgres-url is required")
		fmt.Println()
		flags.Usage()
		os.Exit(1)
	}

	// Validate SQLite path exists
	if _, err := os.Stat(sqlitePath); os.IsNotExist(err) {
		fmt.Printf("Error: SQLite database not found: %s\n", sqlitePath)
		os.Exit(1)
	}

	// Run migration
	ctx := context.Background()
	opts := migrate.Options{
		SQLitePath:  sqlitePath,
		PostgresURL: postgresURL,
		DryRun:      dryRun,
		BatchSize:   batchSize,
	}

	if err := migrate.Run(ctx, opts); err != nil {
		log.Fatalf("Migration failed: %v", err)
	}
}

func printHelp() {
	fmt.Print(`Clipset - Video sharing platform

Usage:
  clipset [command]

Commands:
  (none)     Start the HTTP server
  migrate    Run SQLite to PostgreSQL data migration
  version    Show version information
  help       Show this help message

Migration Command:
  clipset migrate [options]
    --sqlite-path <path>   Path to SQLite database (required)
    --postgres-url <url>   PostgreSQL connection URL (required)
    --dry-run              Show what would be migrated without making changes
    --batch-size <n>       Rows per batch (default: 1000)

  Example:
    clipset migrate --sqlite-path /data/clipset.db --postgres-url postgres://user:pass@localhost:5432/clipset

  Note: Run the Go server first to apply PostgreSQL schema migrations,
        then stop it and run this migration command.

Environment Variables (for server):
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

// Package worker provides background job processing using River.
package worker

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"

	"github.com/clipset/clipset-go/internal/config"
	"github.com/clipset/clipset-go/internal/db"
	"github.com/clipset/clipset-go/internal/services/video"
)

// Worker manages background job processing
type Worker struct {
	client    *river.Client[pgx.Tx]
	pool      *pgxpool.Pool
	database  *db.DB
	config    *config.Config
	processor *video.Processor
}

// Config holds worker configuration
type Config struct {
	Database  *db.DB
	Pool      *pgxpool.Pool
	AppConfig *config.Config
}

// New creates a new background worker
func New(cfg Config) (*Worker, error) {
	// Create video processor
	processorCfg := video.ProcessorConfig{
		FFmpegPath:     cfg.AppConfig.FFmpegPath,
		FFprobePath:    cfg.AppConfig.FFprobePath,
		ProcessTimeout: cfg.AppConfig.VideoProcessingTimeout,
		TempPath:       cfg.AppConfig.TempStoragePath,
		VideoPath:      cfg.AppConfig.VideoStoragePath,
		ThumbnailPath:  cfg.AppConfig.ThumbnailStoragePath,
	}

	processor := video.NewProcessor(processorCfg)

	// Detect available encoders
	encoderInfo := processor.GetFFmpeg().DetectEncoders(context.Background())
	log.Printf("Worker initialized - GPU available: %v, encoders: %v", encoderInfo.GPUAvailable, encoderInfo.Encoders)

	return &Worker{
		pool:      cfg.Pool,
		database:  cfg.Database,
		config:    cfg.AppConfig,
		processor: processor,
	}, nil
}

// Start starts the River worker client
func (w *Worker) Start(ctx context.Context) error {
	// Create transcode worker with dependencies
	transcodeWorker := NewTranscodeWorker(w.database, w.config, w.processor)

	// Configure River workers
	workers := river.NewWorkers()
	river.AddWorker(workers, transcodeWorker)

	// Configure River client
	riverConfig := &river.Config{
		Queues: map[string]river.QueueConfig{
			river.QueueDefault: {MaxWorkers: 2}, // 2 concurrent video processing jobs
		},
		Workers:              workers,
		JobTimeout:           4 * time.Hour, // Long timeout for video processing
		RescueStuckJobsAfter: 6 * time.Hour,
	}

	// Create River client
	client, err := river.NewClient(riverpgxv5.New(w.pool), riverConfig)
	if err != nil {
		return err
	}

	w.client = client

	// Start the worker
	log.Println("Starting River worker...")
	if err := client.Start(ctx); err != nil {
		return err
	}

	log.Println("River worker started")
	return nil
}

// Stop gracefully stops the worker
func (w *Worker) Stop(ctx context.Context) error {
	if w.client == nil {
		return nil
	}

	log.Println("Stopping River worker...")

	// Create shutdown context with timeout
	shutdownCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	if err := w.client.Stop(shutdownCtx); err != nil {
		return err
	}

	log.Println("River worker stopped")
	return nil
}

// Client returns the River client for enqueueing jobs
func (w *Worker) Client() *river.Client[pgx.Tx] {
	return w.client
}

// EnqueueTranscode adds a video transcoding job to the queue
func (w *Worker) EnqueueTranscode(ctx context.Context, videoID string) error {
	_, err := w.client.Insert(ctx, TranscodeJobArgs{VideoID: videoID}, nil)
	if err != nil {
		return err
	}

	log.Printf("Enqueued transcode job for video: %s", videoID)
	return nil
}

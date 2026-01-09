package worker

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/riverqueue/river"

	"github.com/clipset/clipset-go/internal/config"
	"github.com/clipset/clipset-go/internal/db"
	"github.com/clipset/clipset-go/internal/db/sqlc"
	"github.com/clipset/clipset-go/internal/domain"
	"github.com/clipset/clipset-go/internal/services/video"
)

// TranscodeJobArgs defines the arguments for a transcode job
type TranscodeJobArgs struct {
	VideoID string `json:"video_id"`
}

// Kind returns the job type identifier
func (TranscodeJobArgs) Kind() string {
	return "transcode"
}

// TranscodeWorker processes video transcoding jobs
type TranscodeWorker struct {
	river.WorkerDefaults[TranscodeJobArgs]
	database  *db.DB
	config    *config.Config
	processor *video.Processor
}

// NewTranscodeWorker creates a new transcode worker
func NewTranscodeWorker(database *db.DB, cfg *config.Config, processor *video.Processor) *TranscodeWorker {
	return &TranscodeWorker{
		database:  database,
		config:    cfg,
		processor: processor,
	}
}

// Work processes a video transcoding job
func (w *TranscodeWorker) Work(ctx context.Context, job *river.Job[TranscodeJobArgs]) error {
	videoID := job.Args.VideoID

	log.Printf("Starting transcode job for video: %s", videoID)

	// Parse video ID
	videoUUID, err := uuid.Parse(videoID)
	if err != nil {
		return fmt.Errorf("invalid video ID: %w", err)
	}

	// Get video record
	videoRecord, err := w.database.Queries.GetVideoByID(ctx, videoUUID)
	if err != nil {
		return fmt.Errorf("failed to get video: %w", err)
	}

	// Update status to processing
	if _, err := w.database.Queries.UpdateVideoProcessing(ctx, sqlc.UpdateVideoProcessingParams{
		ID:               videoUUID,
		ProcessingStatus: domain.ProcessingStatusProcessing,
		ErrorMessage:     nil,
		DurationSeconds:  nil,
		FileSizeBytes:    0,  // COALESCE will keep existing value
		Column6:          "", // filename - empty keeps existing
		Column7:          "", // thumbnail_filename - empty keeps existing
	}); err != nil {
		log.Printf("Warning: failed to update video status to processing: %v", err)
	}

	// Get transcoding config from database
	dbConfig, err := w.database.Queries.GetConfig(ctx)
	if err != nil {
		log.Printf("Warning: failed to get DB config, using defaults: %v", err)
		dbConfig = defaultDBConfig()
	}

	// Build transcode config
	transcodeCfg := buildTranscodeConfig(dbConfig)

	// Build file paths
	tempPath := filepath.Join(w.config.TempStoragePath, videoRecord.Filename)
	outputFilename := generateOutputFilename(videoRecord.Filename)
	thumbnailFilename := generateThumbnailFilename(videoRecord.Filename)

	// Check if temp file exists
	if _, err := os.Stat(tempPath); os.IsNotExist(err) {
		errMsg := "temp file not found"
		w.updateVideoFailed(ctx, videoUUID, errMsg)
		return fmt.Errorf("temp file not found: %s", tempPath)
	}

	// Process video
	result, err := w.processor.ProcessVideo(
		ctx,
		tempPath,
		outputFilename,
		thumbnailFilename,
		transcodeCfg,
		dbConfig.VideoOutputFormat,
	)

	if err != nil {
		errMsg := fmt.Sprintf("processing failed: %v", err)
		w.updateVideoFailed(ctx, videoUUID, errMsg)
		// Clean up temp file on failure
		os.Remove(tempPath)
		return fmt.Errorf("video processing failed: %w", err)
	}

	if !result.Success {
		errMsg := result.Error
		if errMsg == "" {
			errMsg = "processing failed for unknown reason"
		}
		w.updateVideoFailed(ctx, videoUUID, errMsg)
		os.Remove(tempPath)
		return fmt.Errorf("video processing failed: %s", errMsg)
	}

	// Build final filename based on output format
	var finalFilename string
	if result.OutputFormat == "hls" {
		// For HLS, filename points to the manifest
		finalFilename = filepath.Join(stemWithoutExt(outputFilename), "master.m3u8")
	} else {
		finalFilename = ensureMP4Ext(outputFilename)
	}

	// Update video record with results
	duration := int32(result.Duration)

	if _, err := w.database.Queries.UpdateVideoProcessing(ctx, sqlc.UpdateVideoProcessingParams{
		ID:               videoUUID,
		ProcessingStatus: domain.ProcessingStatusCompleted,
		ErrorMessage:     nil,
		DurationSeconds:  &duration,
		FileSizeBytes:    result.FileSize,
		Column6:          finalFilename,
		Column7:          thumbnailFilename,
	}); err != nil {
		log.Printf("Error updating video after processing: %v", err)
		return fmt.Errorf("failed to update video record: %w", err)
	}

	// Clean up temp file
	if err := os.Remove(tempPath); err != nil {
		log.Printf("Warning: failed to remove temp file: %v", err)
	}

	log.Printf("Transcode job completed for video: %s (duration=%ds, size=%d, format=%s)",
		videoID, result.Duration, result.FileSize, result.OutputFormat)

	return nil
}

// updateVideoFailed updates video status to failed with error message
func (w *TranscodeWorker) updateVideoFailed(ctx context.Context, videoID uuid.UUID, errMsg string) {
	if _, err := w.database.Queries.UpdateVideoProcessing(ctx, sqlc.UpdateVideoProcessingParams{
		ID:               videoID,
		ProcessingStatus: domain.ProcessingStatusFailed,
		ErrorMessage:     &errMsg,
		DurationSeconds:  nil,
		FileSizeBytes:    0, // COALESCE will keep existing value
		Column6:          "",
		Column7:          "",
	}); err != nil {
		log.Printf("Error updating video to failed status: %v", err)
	}
}

// buildTranscodeConfig creates TranscodeConfig from database config
func buildTranscodeConfig(cfg sqlc.Config) video.TranscodeConfig {
	// Parse max resolution
	maxWidth, maxHeight := parseResolution(cfg.MaxResolution)

	return video.TranscodeConfig{
		UseGPU:           cfg.UseGpuTranscoding,
		MaxWidth:         maxWidth,
		MaxHeight:        maxHeight,
		AudioBitrate:     cfg.AudioBitrate,
		CPUPreset:        cfg.CpuPreset,
		CPUCRF:           int(cfg.CpuCrf),
		NVENCPreset:      cfg.NvencPreset,
		NVENCCQ:          int(cfg.NvencCq),
		NVENCRateControl: cfg.NvencRateControl,
		NVENCMaxBitrate:  cfg.NvencMaxBitrate,
		NVENCBufferSize:  cfg.NvencBufferSize,
	}
}

// parseResolution parses resolution string like "1920x1080" to width, height
func parseResolution(resolution string) (int, int) {
	parts := strings.Split(resolution, "x")
	if len(parts) != 2 {
		return 1920, 1080 // Default to 1080p
	}

	width, err := strconv.Atoi(parts[0])
	if err != nil {
		return 1920, 1080
	}

	height, err := strconv.Atoi(parts[1])
	if err != nil {
		return 1920, 1080
	}

	return width, height
}

// defaultDBConfig returns fallback config values
func defaultDBConfig() sqlc.Config {
	return sqlc.Config{
		UseGpuTranscoding: false,
		NvencPreset:       "p4",
		NvencCq:           18,
		NvencRateControl:  "vbr",
		NvencMaxBitrate:   "8M",
		NvencBufferSize:   "16M",
		CpuPreset:         "medium",
		CpuCrf:            18,
		MaxResolution:     "1920x1080",
		AudioBitrate:      "192k",
		VideoOutputFormat: "progressive",
	}
}

// generateOutputFilename generates the output filename from original
func generateOutputFilename(originalFilename string) string {
	// Keep the same UUID-based name, just change extension
	return stemWithoutExt(originalFilename) + ".mp4"
}

// generateThumbnailFilename generates the thumbnail filename
func generateThumbnailFilename(originalFilename string) string {
	return stemWithoutExt(originalFilename) + ".jpg"
}

// stemWithoutExt returns filename without extension
func stemWithoutExt(filename string) string {
	ext := filepath.Ext(filename)
	return filename[:len(filename)-len(ext)]
}

// ensureMP4Ext ensures filename has .mp4 extension
func ensureMP4Ext(filename string) string {
	ext := filepath.Ext(filename)
	if ext == ".mp4" {
		return filename
	}
	return stemWithoutExt(filename) + ".mp4"
}

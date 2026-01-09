package video

import (
	"context"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"time"
)

// ProcessResult contains the result of video processing
type ProcessResult struct {
	Success      bool
	Error        string
	Duration     int    // Duration in seconds
	Width        int    // Video width
	Height       int    // Video height
	Codec        string // Video codec
	OutputFormat string // "hls" or "progressive"
	FileSize     int64  // Final file size in bytes
}

// Processor handles the complete video processing pipeline
type Processor struct {
	ffmpeg        *FFmpeg
	tempPath      string
	videoPath     string
	thumbnailPath string
}

// ProcessorConfig holds configuration for the video processor
type ProcessorConfig struct {
	FFmpegPath     string
	FFprobePath    string
	ProcessTimeout time.Duration
	TempPath       string
	VideoPath      string
	ThumbnailPath  string
}

// NewProcessor creates a new video processor
func NewProcessor(cfg ProcessorConfig) *Processor {
	ffmpegCfg := FFmpegConfig{
		FFmpegPath:  cfg.FFmpegPath,
		FFprobePath: cfg.FFprobePath,
	}

	return &Processor{
		ffmpeg:        NewFFmpeg(ffmpegCfg),
		tempPath:      cfg.TempPath,
		videoPath:     cfg.VideoPath,
		thumbnailPath: cfg.ThumbnailPath,
	}
}

// ProcessVideo runs the complete video processing pipeline
//
// Steps:
// 1. Validate video file
// 2. Extract metadata
// 3. Transcode based on output format config (hls or progressive)
// 4. Extract thumbnail
func (p *Processor) ProcessVideo(ctx context.Context, inputPath, outputFilename, thumbnailFilename string, transcodeCfg TranscodeConfig, outputFormat string) (*ProcessResult, error) {
	result := &ProcessResult{
		Success:      false,
		OutputFormat: outputFormat,
	}

	// 1. Validate video file
	valid, errMsg := p.ffmpeg.ValidateVideo(ctx, inputPath)
	if !valid {
		result.Error = errMsg
		return result, fmt.Errorf("validation failed: %s", errMsg)
	}

	// 2. Extract metadata
	metadata, err := p.ffmpeg.GetMetadata(ctx, inputPath)
	if err != nil {
		log.Printf("Warning: failed to extract metadata: %v", err)
		// Continue processing even if metadata extraction fails
	} else {
		result.Duration = metadata.Duration
		result.Width = metadata.Width
		result.Height = metadata.Height
		result.Codec = metadata.Codec
	}

	// Build color info from metadata
	var colorInfo *ColorInfo
	if metadata != nil {
		colorInfo = &ColorInfo{
			ColorRange:     metadata.ColorRange,
			ColorSpace:     metadata.ColorSpace,
			ColorTransfer:  metadata.ColorTransfer,
			ColorPrimaries: metadata.ColorPrimaries,
			PixFmt:         metadata.PixFmt,
		}
	}

	// 3. Transcode based on output format
	if outputFormat == "hls" {
		// HLS output - create directory with segments
		// outputFilename is used as the directory name (stem without extension)
		hlsDir := filepath.Join(p.videoPath, stemWithoutExt(outputFilename))
		if err := os.MkdirAll(hlsDir, 0755); err != nil {
			result.Error = fmt.Sprintf("Failed to create HLS directory: %v", err)
			return result, fmt.Errorf("failed to create HLS directory: %w", err)
		}

		log.Printf("Processing video for HLS output: %s -> %s", inputPath, hlsDir)

		if err := p.ffmpeg.TranscodeHLS(ctx, inputPath, hlsDir, transcodeCfg, colorInfo); err != nil {
			result.Error = fmt.Sprintf("HLS transcoding failed: %v", err)
			return result, fmt.Errorf("HLS transcoding failed: %w", err)
		}

		// Calculate total size of HLS files
		totalSize, err := calculateDirSize(hlsDir)
		if err != nil {
			log.Printf("Warning: failed to calculate HLS size: %v", err)
		} else {
			result.FileSize = totalSize
		}

		result.OutputFormat = "hls"

	} else {
		// Progressive output - single MP4 file
		outputPath := filepath.Join(p.videoPath, ensureMP4Ext(outputFilename))

		// Check if we need to transcode
		needsTranscode := p.ffmpeg.NeedsTranscoding(ctx, inputPath)

		if needsTranscode {
			log.Printf("Processing video for progressive output: %s -> %s", inputPath, outputPath)

			if err := p.ffmpeg.TranscodeProgressiveMP4(ctx, inputPath, outputPath, transcodeCfg, colorInfo); err != nil {
				result.Error = fmt.Sprintf("Progressive transcoding failed: %v", err)
				return result, fmt.Errorf("progressive transcoding failed: %w", err)
			}
		} else {
			// Video is already compatible, just copy it
			log.Printf("Video already compatible, copying: %s -> %s", inputPath, outputPath)
			if err := copyFile(inputPath, outputPath); err != nil {
				result.Error = fmt.Sprintf("Failed to copy video: %v", err)
				return result, fmt.Errorf("failed to copy video: %w", err)
			}
		}

		// Get output file size
		info, err := os.Stat(outputPath)
		if err != nil {
			log.Printf("Warning: failed to get output file size: %v", err)
		} else {
			result.FileSize = info.Size()
		}

		result.OutputFormat = "progressive"
	}

	// 4. Extract thumbnail
	thumbnailPath := filepath.Join(p.thumbnailPath, thumbnailFilename)
	if err := os.MkdirAll(filepath.Dir(thumbnailPath), 0755); err != nil {
		log.Printf("Warning: failed to create thumbnail directory: %v", err)
	}

	// For HLS, extract from input; for progressive, extract from output
	thumbnailSource := inputPath
	if outputFormat != "hls" {
		outputPath := filepath.Join(p.videoPath, ensureMP4Ext(outputFilename))
		if _, err := os.Stat(outputPath); err == nil {
			thumbnailSource = outputPath
		}
	}

	if err := p.ffmpeg.ExtractThumbnail(ctx, thumbnailSource, thumbnailPath, 1.0); err != nil {
		log.Printf("Warning: thumbnail extraction failed (non-critical): %v", err)
		// Continue - thumbnail is non-critical
	}

	result.Success = true
	log.Printf("Video processing completed successfully (format=%s): %s", outputFormat, outputFilename)

	return result, nil
}

// GetFFmpeg returns the underlying FFmpeg service for direct access
func (p *Processor) GetFFmpeg() *FFmpeg {
	return p.ffmpeg
}

// Helper functions

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

// calculateDirSize calculates total size of files in a directory
func calculateDirSize(dir string) (int64, error) {
	var totalSize int64
	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() {
			info, err := d.Info()
			if err != nil {
				return err
			}
			totalSize += info.Size()
		}
		return nil
	})
	return totalSize, err
}

// copyFile copies a file from src to dst
func copyFile(src, dst string) error {
	// Ensure destination directory exists
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return err
	}

	srcFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer srcFile.Close()

	dstFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer dstFile.Close()

	_, err = dstFile.ReadFrom(srcFile)
	return err
}

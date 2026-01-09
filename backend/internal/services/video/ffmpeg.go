// Package video provides video processing services using FFmpeg.
package video

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// FFmpegConfig holds FFmpeg command paths and settings
type FFmpegConfig struct {
	FFmpegPath  string
	FFprobePath string
	Timeout     time.Duration
}

// FFmpeg provides video processing operations using FFmpeg
type FFmpeg struct {
	config FFmpegConfig
}

// NewFFmpeg creates a new FFmpeg service
func NewFFmpeg(cfg FFmpegConfig) *FFmpeg {
	if cfg.FFmpegPath == "" {
		cfg.FFmpegPath = "ffmpeg"
	}
	if cfg.FFprobePath == "" {
		cfg.FFprobePath = "ffprobe"
	}
	if cfg.Timeout == 0 {
		cfg.Timeout = 2 * time.Hour
	}
	return &FFmpeg{config: cfg}
}

// VideoMetadata contains extracted video information
type VideoMetadata struct {
	Duration       int    // Duration in seconds
	Width          int    // Video width
	Height         int    // Video height
	Codec          string // Video codec name
	ColorRange     string // Color range (pc/tv)
	ColorSpace     string // Color space
	ColorTransfer  string // Color transfer
	ColorPrimaries string // Color primaries
	PixFmt         string // Pixel format
}

// ColorInfo holds color-related metadata for transcoding
type ColorInfo struct {
	ColorRange     string
	ColorSpace     string
	ColorTransfer  string
	ColorPrimaries string
	PixFmt         string
}

// TranscodeConfig holds transcoding settings
type TranscodeConfig struct {
	UseGPU           bool
	MaxWidth         int
	MaxHeight        int
	AudioBitrate     string
	CPUPreset        string
	CPUCRF           int
	NVENCPreset      string
	NVENCCQ          int
	NVENCRateControl string
	NVENCMaxBitrate  string
	NVENCBufferSize  string
}

// DefaultTranscodeConfig returns sensible defaults
func DefaultTranscodeConfig() TranscodeConfig {
	return TranscodeConfig{
		UseGPU:           false,
		MaxWidth:         1920,
		MaxHeight:        1080,
		AudioBitrate:     "192k",
		CPUPreset:        "medium",
		CPUCRF:           18,
		NVENCPreset:      "p4",
		NVENCCQ:          18,
		NVENCRateControl: "vbr",
		NVENCMaxBitrate:  "8M",
		NVENCBufferSize:  "16M",
	}
}

// EncoderInfo contains information about available encoders
type EncoderInfo struct {
	GPUAvailable bool     `json:"gpu_available"`
	GPUName      string   `json:"gpu_name,omitempty"`
	Encoders     []string `json:"encoders"`
}

// DetectEncoders checks which video encoders are available
func (f *FFmpeg) DetectEncoders(ctx context.Context) EncoderInfo {
	result := EncoderInfo{
		Encoders: []string{},
	}

	// Get encoders from FFmpeg
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, f.config.FFmpegPath, "-encoders", "-hide_banner")
	output, err := cmd.Output()
	if err != nil {
		log.Printf("Warning: failed to detect FFmpeg encoders: %v", err)
		return result
	}

	// Check for encoders we care about
	encoderNames := []string{
		"h264_nvenc",
		"hevc_nvenc",
		"av1_nvenc",
		"libx264",
		"libx265",
	}

	outputStr := string(output)
	for _, encoder := range encoderNames {
		if strings.Contains(outputStr, encoder) {
			result.Encoders = append(result.Encoders, encoder)
		}
	}

	// Check if NVENC is available
	for _, enc := range result.Encoders {
		if strings.Contains(enc, "nvenc") {
			result.GPUAvailable = true
			break
		}
	}

	// Try to get GPU name using nvidia-smi
	if result.GPUAvailable {
		nvidiaCtx, nvidiaCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer nvidiaCancel()

		nvidiaCmd := exec.CommandContext(nvidiaCtx, "nvidia-smi", "--query-gpu=name", "--format=csv,noheader")
		nvidiaOutput, err := nvidiaCmd.Output()
		if err == nil {
			gpuName := strings.TrimSpace(strings.Split(string(nvidiaOutput), "\n")[0])
			result.GPUName = gpuName
			log.Printf("Detected GPU: %s", gpuName)
		}
	}

	log.Printf("Encoder detection result: GPU=%v, encoders=%v", result.GPUAvailable, result.Encoders)
	return result
}

// ValidateVideo checks if a file is a valid video using ffprobe
func (f *FFmpeg) ValidateVideo(ctx context.Context, filepath string) (bool, string) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, f.config.FFprobePath,
		"-v", "error",
		"-select_streams", "v:0",
		"-show_entries", "stream=codec_type",
		"-of", "default=noprint_wrappers=1:nokey=1",
		filepath,
	)

	output, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return false, fmt.Sprintf("Invalid video file: %s", string(exitErr.Stderr))
		}
		return false, fmt.Sprintf("Failed to validate video: %v", err)
	}

	if !strings.Contains(strings.ToLower(string(output)), "video") {
		return false, "File is not a valid video"
	}

	log.Printf("Video file validated: %s", filepath)
	return true, ""
}

// GetMetadata extracts video metadata using ffprobe
func (f *FFmpeg) GetMetadata(ctx context.Context, filepath string) (*VideoMetadata, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, f.config.FFprobePath,
		"-v", "error",
		"-show_entries", "format=duration:stream=width,height,codec_name,color_range,color_space,color_transfer,color_primaries,pix_fmt",
		"-of", "json",
		filepath,
	)

	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to extract metadata: %w", err)
	}

	var data struct {
		Format struct {
			Duration string `json:"duration"`
		} `json:"format"`
		Streams []struct {
			Width          int    `json:"width"`
			Height         int    `json:"height"`
			CodecName      string `json:"codec_name"`
			ColorRange     string `json:"color_range"`
			ColorSpace     string `json:"color_space"`
			ColorTransfer  string `json:"color_transfer"`
			ColorPrimaries string `json:"color_primaries"`
			PixFmt         string `json:"pix_fmt"`
		} `json:"streams"`
	}

	if err := json.Unmarshal(output, &data); err != nil {
		return nil, fmt.Errorf("failed to parse metadata: %w", err)
	}

	metadata := &VideoMetadata{}

	// Parse duration
	if data.Format.Duration != "" {
		if dur, err := strconv.ParseFloat(data.Format.Duration, 64); err == nil {
			metadata.Duration = int(dur)
		}
	}

	// Get video stream info
	if len(data.Streams) > 0 {
		stream := data.Streams[0]
		metadata.Width = stream.Width
		metadata.Height = stream.Height
		metadata.Codec = stream.CodecName
		metadata.ColorRange = stream.ColorRange
		metadata.ColorSpace = stream.ColorSpace
		metadata.ColorTransfer = stream.ColorTransfer
		metadata.ColorPrimaries = stream.ColorPrimaries
		metadata.PixFmt = stream.PixFmt
	}

	log.Printf("Extracted metadata from %s: duration=%ds, %dx%d, codec=%s",
		filepath, metadata.Duration, metadata.Width, metadata.Height, metadata.Codec)

	return metadata, nil
}

// NeedsTranscoding checks if video needs transcoding for web compatibility
func (f *FFmpeg) NeedsTranscoding(ctx context.Context, filepath string) bool {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	// Get codec
	cmd := exec.CommandContext(ctx, f.config.FFprobePath,
		"-v", "error",
		"-select_streams", "v:0",
		"-show_entries", "stream=codec_name",
		"-of", "default=noprint_wrappers=1:nokey=1",
		filepath,
	)

	output, err := cmd.Output()
	if err != nil {
		log.Printf("Could not determine codec, will transcode: %v", err)
		return true
	}

	codec := strings.TrimSpace(strings.ToLower(string(output)))

	// Get pixel format
	cmd2 := exec.CommandContext(ctx, f.config.FFprobePath,
		"-v", "error",
		"-select_streams", "v:0",
		"-show_entries", "stream=pix_fmt",
		"-of", "default=noprint_wrappers=1:nokey=1",
		filepath,
	)

	pixOutput, _ := cmd2.Output()
	pixFmt := strings.TrimSpace(strings.ToLower(string(pixOutput)))

	// Check if 8-bit (no 10/12 in pixel format)
	is8Bit := !strings.Contains(pixFmt, "10") && !strings.Contains(pixFmt, "12")

	// Check if H.264
	isH264 := codec == "h264" || codec == "libx264" || codec == "avc"

	// Check if MP4
	isMP4 := strings.HasSuffix(strings.ToLower(filepath), ".mp4")

	needsTranscode := !(isH264 && isMP4 && is8Bit)

	log.Printf("Video %s - codec: %s, pix_fmt: %s, is_mp4: %v, needs_transcoding: %v",
		filepath, codec, pixFmt, isMP4, needsTranscode)

	return needsTranscode
}

// buildScaleFilter creates the scale filter string
func buildScaleFilter(maxWidth, maxHeight int, isFullRange bool) string {
	if isFullRange {
		return fmt.Sprintf("scale='min(%d,iw)':'min(%d,ih)':force_original_aspect_ratio=decrease:out_range=full",
			maxWidth, maxHeight)
	}
	return fmt.Sprintf("scale='min(%d,iw)':'min(%d,ih)':force_original_aspect_ratio=decrease",
		maxWidth, maxHeight)
}

// isFullColorRange checks if video uses full color range
func isFullColorRange(colorInfo *ColorInfo) bool {
	if colorInfo == nil {
		return false
	}
	return colorInfo.ColorRange == "pc" || strings.HasPrefix(colorInfo.PixFmt, "yuvj")
}

// TranscodeProgressiveMP4 transcodes video to H.264 MP4 optimized for web streaming
func (f *FFmpeg) TranscodeProgressiveMP4(ctx context.Context, inputPath, outputPath string, cfg TranscodeConfig, colorInfo *ColorInfo) error {
	ctx, cancel := context.WithTimeout(ctx, f.config.Timeout)
	defer cancel()

	isFullRange := isFullColorRange(colorInfo)
	outputPixFmt := "yuv420p"
	outputColorRange := "tv"
	if isFullRange {
		outputPixFmt = "yuvj420p"
		outputColorRange = "pc"
	}

	scaleFilter := buildScaleFilter(cfg.MaxWidth, cfg.MaxHeight, isFullRange)

	var args []string

	if cfg.UseGPU {
		// GPU encoding with NVENC
		log.Printf("Transcoding with GPU (h264_nvenc): %s -> %s", inputPath, outputPath)

		args = []string{
			"-i", inputPath,
			"-vf", scaleFilter,
			"-c:v", "h264_nvenc",
			"-pix_fmt", outputPixFmt,
			"-preset", cfg.NVENCPreset,
			"-rc", cfg.NVENCRateControl,
			"-cq", strconv.Itoa(cfg.NVENCCQ),
			"-b:v", "0",
			"-maxrate", cfg.NVENCMaxBitrate,
			"-bufsize", cfg.NVENCBufferSize,
			"-color_range", outputColorRange,
		}
	} else {
		// CPU encoding with libx264
		log.Printf("Transcoding with CPU (libx264): %s -> %s", inputPath, outputPath)

		args = []string{
			"-i", inputPath,
			"-vf", scaleFilter,
			"-c:v", "libx264",
			"-pix_fmt", outputPixFmt,
			"-preset", cfg.CPUPreset,
			"-crf", strconv.Itoa(cfg.CPUCRF),
			"-color_range", outputColorRange,
		}
	}

	// Add color metadata if available
	if colorInfo != nil {
		if colorInfo.ColorSpace != "" {
			args = append(args, "-colorspace", colorInfo.ColorSpace)
		}
		if colorInfo.ColorTransfer != "" {
			args = append(args, "-color_trc", colorInfo.ColorTransfer)
		}
		if colorInfo.ColorPrimaries != "" {
			args = append(args, "-color_primaries", colorInfo.ColorPrimaries)
		}
	}

	// Add audio and output settings
	args = append(args,
		"-c:a", "aac",
		"-b:a", cfg.AudioBitrate,
		"-movflags", "+faststart",
		"-y", outputPath,
	)

	cmd := exec.CommandContext(ctx, f.config.FFmpegPath, args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		// If GPU failed, try CPU fallback
		if cfg.UseGPU {
			log.Printf("GPU transcoding failed, falling back to CPU: %v", err)
			cpuCfg := cfg
			cpuCfg.UseGPU = false
			return f.TranscodeProgressiveMP4(ctx, inputPath, outputPath, cpuCfg, colorInfo)
		}

		return fmt.Errorf("transcoding failed: %v, stderr: %s", err, stderr.String())
	}

	log.Printf("Transcoding completed: %s", outputPath)
	return nil
}

// TranscodeHLS transcodes video to HLS format (segmented streaming)
func (f *FFmpeg) TranscodeHLS(ctx context.Context, inputPath, outputDir string, cfg TranscodeConfig, colorInfo *ColorInfo) error {
	ctx, cancel := context.WithTimeout(ctx, f.config.Timeout)
	defer cancel()

	isFullRange := isFullColorRange(colorInfo)
	outputPixFmt := "yuv420p"
	outputColorRange := "tv"
	if isFullRange {
		outputPixFmt = "yuvj420p"
		outputColorRange = "pc"
	}

	scaleFilter := buildScaleFilter(cfg.MaxWidth, cfg.MaxHeight, isFullRange)

	manifestPath := filepath.Join(outputDir, "master.m3u8")
	segmentPattern := filepath.Join(outputDir, "segment%03d.ts")
	hlsTime := "4" // 4-second segments

	var args []string

	if cfg.UseGPU {
		log.Printf("HLS transcoding with GPU (h264_nvenc): %s -> %s", inputPath, outputDir)

		args = []string{
			"-i", inputPath,
			"-vf", scaleFilter,
			"-c:v", "h264_nvenc",
			"-pix_fmt", outputPixFmt,
			"-preset", cfg.NVENCPreset,
			"-rc", cfg.NVENCRateControl,
			"-cq", strconv.Itoa(cfg.NVENCCQ),
			"-b:v", "0",
			"-maxrate", cfg.NVENCMaxBitrate,
			"-bufsize", cfg.NVENCBufferSize,
			"-color_range", outputColorRange,
		}
	} else {
		log.Printf("HLS transcoding with CPU (libx264): %s -> %s", inputPath, outputDir)

		args = []string{
			"-i", inputPath,
			"-vf", scaleFilter,
			"-c:v", "libx264",
			"-pix_fmt", outputPixFmt,
			"-preset", cfg.CPUPreset,
			"-crf", strconv.Itoa(cfg.CPUCRF),
			"-color_range", outputColorRange,
		}
	}

	// Add color metadata if available
	if colorInfo != nil {
		if colorInfo.ColorSpace != "" {
			args = append(args, "-colorspace", colorInfo.ColorSpace)
		}
		if colorInfo.ColorTransfer != "" {
			args = append(args, "-color_trc", colorInfo.ColorTransfer)
		}
		if colorInfo.ColorPrimaries != "" {
			args = append(args, "-color_primaries", colorInfo.ColorPrimaries)
		}
	}

	// Add audio and HLS output settings
	args = append(args,
		"-c:a", "aac",
		"-b:a", cfg.AudioBitrate,
		"-f", "hls",
		"-hls_time", hlsTime,
		"-hls_list_size", "0",
		"-hls_segment_type", "mpegts",
		"-hls_segment_filename", segmentPattern,
		"-y", manifestPath,
	)

	cmd := exec.CommandContext(ctx, f.config.FFmpegPath, args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		// If GPU failed, try CPU fallback
		if cfg.UseGPU {
			log.Printf("GPU HLS transcoding failed, falling back to CPU: %v", err)
			cpuCfg := cfg
			cpuCfg.UseGPU = false
			return f.TranscodeHLS(ctx, inputPath, outputDir, cpuCfg, colorInfo)
		}

		return fmt.Errorf("HLS transcoding failed: %v, stderr: %s", err, stderr.String())
	}

	log.Printf("HLS transcoding completed: %s", outputDir)
	return nil
}

// ExtractThumbnail extracts a thumbnail from video at specified timestamp
func (f *FFmpeg) ExtractThumbnail(ctx context.Context, videoPath, thumbnailPath string, timestampSec float64) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	args := []string{
		"-ss", fmt.Sprintf("%.2f", timestampSec),
		"-i", videoPath,
		"-vframes", "1",
		"-vf", "scale=640:-1",
		"-q:v", "2",
		"-y", thumbnailPath,
	}

	cmd := exec.CommandContext(ctx, f.config.FFmpegPath, args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("thumbnail extraction failed: %v, stderr: %s", err, stderr.String())
	}

	log.Printf("Thumbnail extracted: %s", thumbnailPath)
	return nil
}

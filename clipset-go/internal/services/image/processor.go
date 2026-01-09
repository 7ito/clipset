package image

import (
	"fmt"
	"image"
	"image/color"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/disintegration/imaging"
	"github.com/google/uuid"
)

// Supported image formats
var supportedFormats = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
	".gif":  true,
	".webp": true,
	".bmp":  true,
}

// Processor handles image processing operations
type Processor struct {
	tempPath     string
	avatarPath   string
	maxSizeBytes int64
	avatarSize   int
	webpQuality  int
}

// NewProcessor creates a new image processor
func NewProcessor(tempPath, avatarPath string, maxSizeBytes int64, avatarSize int) *Processor {
	return &Processor{
		tempPath:     tempPath,
		avatarPath:   avatarPath,
		maxSizeBytes: maxSizeBytes,
		avatarSize:   avatarSize,
		webpQuality:  85,
	}
}

// ValidateImage validates an image file's format and size
func (p *Processor) ValidateImage(filePath string) error {
	// Check file exists
	info, err := os.Stat(filePath)
	if err != nil {
		return fmt.Errorf("cannot access file: %w", err)
	}

	// Check file size
	if info.Size() > p.maxSizeBytes {
		return fmt.Errorf("image file too large: %d bytes (max: %d bytes)", info.Size(), p.maxSizeBytes)
	}

	// Check extension
	ext := strings.ToLower(filepath.Ext(filePath))
	if !supportedFormats[ext] {
		return fmt.Errorf("unsupported image format: %s", ext)
	}

	// Try to decode to verify it's a valid image
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("cannot open file: %w", err)
	}
	defer file.Close()

	_, _, err = image.DecodeConfig(file)
	if err != nil {
		return fmt.Errorf("invalid image file: %w", err)
	}

	return nil
}

// ProcessAvatar processes an uploaded avatar image:
// - Resizes maintaining aspect ratio to fit within target size
// - Centers on a square canvas
// - Converts to JPEG format (since pure Go WebP encoding is limited)
// Returns the output filename
func (p *Processor) ProcessAvatar(inputPath string, userID string) (string, error) {
	// Generate unique filename
	uniqueSuffix := uuid.New().String()[:8]
	filename := fmt.Sprintf("%s_%s.jpg", userID, uniqueSuffix)
	outputPath := filepath.Join(p.avatarPath, filename)

	// Open the source image
	src, err := imaging.Open(inputPath)
	if err != nil {
		return "", fmt.Errorf("failed to open image: %w", err)
	}

	// Resize to fit within target dimensions while maintaining aspect ratio
	resized := imaging.Fit(src, p.avatarSize, p.avatarSize, imaging.Lanczos)

	// Create a square canvas with white background
	canvas := imaging.New(p.avatarSize, p.avatarSize, color.White)

	// Center the resized image on the canvas
	offsetX := (p.avatarSize - resized.Bounds().Dx()) / 2
	offsetY := (p.avatarSize - resized.Bounds().Dy()) / 2
	canvas = imaging.Paste(canvas, resized, image.Pt(offsetX, offsetY))

	// Ensure output directory exists
	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		return "", fmt.Errorf("failed to create output directory: %w", err)
	}

	// Save as JPEG (imaging library has better JPEG support than WebP)
	err = imaging.Save(canvas, outputPath, imaging.JPEGQuality(p.webpQuality))
	if err != nil {
		return "", fmt.Errorf("failed to save processed image: %w", err)
	}

	return filename, nil
}

// SaveUploadToTemp saves an uploaded file to a temporary location
func (p *Processor) SaveUploadToTemp(reader io.Reader, originalFilename string) (string, error) {
	// Ensure temp directory exists
	if err := os.MkdirAll(p.tempPath, 0755); err != nil {
		return "", fmt.Errorf("failed to create temp directory: %w", err)
	}

	// Get extension from original filename
	ext := filepath.Ext(originalFilename)
	if ext == "" {
		ext = ".tmp"
	}

	// Generate temp filename
	tempFilename := fmt.Sprintf("upload_%s%s", uuid.New().String(), ext)
	tempPath := filepath.Join(p.tempPath, tempFilename)

	// Create temp file
	file, err := os.Create(tempPath)
	if err != nil {
		return "", fmt.Errorf("failed to create temp file: %w", err)
	}
	defer file.Close()

	// Copy data
	_, err = io.Copy(file, reader)
	if err != nil {
		os.Remove(tempPath)
		return "", fmt.Errorf("failed to write temp file: %w", err)
	}

	return tempPath, nil
}

// DeleteFile deletes a file if it exists
func (p *Processor) DeleteFile(filePath string) error {
	if filePath == "" {
		return nil
	}

	err := os.Remove(filePath)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to delete file: %w", err)
	}
	return nil
}

// DeleteAvatar deletes an avatar file from the avatar storage directory
func (p *Processor) DeleteAvatar(filename string) error {
	if filename == "" {
		return nil
	}

	filePath := filepath.Join(p.avatarPath, filename)
	return p.DeleteFile(filePath)
}

// EnsureDirectories creates required storage directories
func (p *Processor) EnsureDirectories() error {
	dirs := []string{p.tempPath, p.avatarPath}

	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("failed to create directory %s: %w", dir, err)
		}
	}

	return nil
}

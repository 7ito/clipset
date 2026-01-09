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

// Processor handles image processing operations for avatars and category images
type Processor struct {
	tempPath          string
	avatarPath        string
	categoryImagePath string
	maxAvatarSize     int64
	maxCategorySize   int64
	avatarSize        int
	categoryImageSize int
	jpegQuality       int
}

// ProcessorConfig holds configuration for the image processor
type ProcessorConfig struct {
	TempPath          string
	AvatarPath        string
	CategoryImagePath string
	MaxAvatarSize     int64
	MaxCategorySize   int64
	AvatarSize        int
	CategoryImageSize int
}

// NewProcessor creates a new image processor with the given configuration
func NewProcessor(cfg ProcessorConfig) *Processor {
	return &Processor{
		tempPath:          cfg.TempPath,
		avatarPath:        cfg.AvatarPath,
		categoryImagePath: cfg.CategoryImagePath,
		maxAvatarSize:     cfg.MaxAvatarSize,
		maxCategorySize:   cfg.MaxCategorySize,
		avatarSize:        cfg.AvatarSize,
		categoryImageSize: cfg.CategoryImageSize,
		jpegQuality:       85,
	}
}

// ValidateImage validates an image file's format and size
func (p *Processor) ValidateImage(filePath string, maxSizeBytes int64) error {
	// Check file exists
	info, err := os.Stat(filePath)
	if err != nil {
		return fmt.Errorf("cannot access file: %w", err)
	}

	// Check file size
	if info.Size() > maxSizeBytes {
		return fmt.Errorf("image file too large: %d bytes (max: %d bytes)", info.Size(), maxSizeBytes)
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

// ValidateAvatarImage validates an avatar image file
func (p *Processor) ValidateAvatarImage(filePath string) error {
	return p.ValidateImage(filePath, p.maxAvatarSize)
}

// ValidateCategoryImage validates a category image file
func (p *Processor) ValidateCategoryImage(filePath string) error {
	return p.ValidateImage(filePath, p.maxCategorySize)
}

// processImage is a generic image processing function
func (p *Processor) processImage(inputPath, outputPath string, size int) error {
	// Open the source image
	src, err := imaging.Open(inputPath)
	if err != nil {
		return fmt.Errorf("failed to open image: %w", err)
	}

	// Resize to fit within target dimensions while maintaining aspect ratio
	resized := imaging.Fit(src, size, size, imaging.Lanczos)

	// Create a square canvas with white background
	canvas := imaging.New(size, size, color.White)

	// Center the resized image on the canvas
	offsetX := (size - resized.Bounds().Dx()) / 2
	offsetY := (size - resized.Bounds().Dy()) / 2
	canvas = imaging.Paste(canvas, resized, image.Pt(offsetX, offsetY))

	// Ensure output directory exists
	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		return fmt.Errorf("failed to create output directory: %w", err)
	}

	// Save as JPEG
	err = imaging.Save(canvas, outputPath, imaging.JPEGQuality(p.jpegQuality))
	if err != nil {
		return fmt.Errorf("failed to save processed image: %w", err)
	}

	return nil
}

// ProcessAvatar processes an uploaded avatar image:
// - Resizes maintaining aspect ratio to fit within target size
// - Centers on a square canvas
// - Converts to JPEG format
// Returns the output filename
func (p *Processor) ProcessAvatar(inputPath string, userID string) (string, error) {
	// Generate unique filename
	uniqueSuffix := uuid.New().String()[:8]
	filename := fmt.Sprintf("%s_%s.jpg", userID, uniqueSuffix)
	outputPath := filepath.Join(p.avatarPath, filename)

	if err := p.processImage(inputPath, outputPath, p.avatarSize); err != nil {
		return "", err
	}

	return filename, nil
}

// ProcessCategoryImage processes an uploaded category image:
// - Resizes maintaining aspect ratio to fit within target size (400x400)
// - Centers on a square canvas
// - Converts to JPEG format
// Returns the output filename
func (p *Processor) ProcessCategoryImage(inputPath string, categoryID string) (string, error) {
	// Category images use the category ID as the filename
	filename := fmt.Sprintf("%s.jpg", categoryID)
	outputPath := filepath.Join(p.categoryImagePath, filename)

	if err := p.processImage(inputPath, outputPath, p.categoryImageSize); err != nil {
		return "", err
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

// DeleteCategoryImage deletes a category image file from the category image storage directory
func (p *Processor) DeleteCategoryImage(filename string) error {
	if filename == "" {
		return nil
	}

	filePath := filepath.Join(p.categoryImagePath, filename)
	return p.DeleteFile(filePath)
}

// GetCategoryImagePath returns the full path to a category image file
func (p *Processor) GetCategoryImagePath(filename string) string {
	return filepath.Join(p.categoryImagePath, filename)
}

// EnsureDirectories creates required storage directories
func (p *Processor) EnsureDirectories() error {
	dirs := []string{p.tempPath, p.avatarPath, p.categoryImagePath}

	for _, dir := range dirs {
		if dir == "" {
			continue
		}
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("failed to create directory %s: %w", dir, err)
		}
	}

	return nil
}

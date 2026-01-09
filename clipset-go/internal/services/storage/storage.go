// Package storage provides file storage operations for video uploads.
package storage

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Known video file signatures (magic bytes)
var videoSignatures = []struct {
	name    string
	offset  int
	pattern []byte
}{
	// MP4/MOV - check for 'ftyp' at offset 4
	{"mp4/mov", 4, []byte("ftyp")},
	// AVI - starts with 'RIFF'
	{"avi", 0, []byte("RIFF")},
	// MKV/WebM - EBML header
	{"mkv/webm", 0, []byte{0x1A, 0x45, 0xDF, 0xA3}},
	// MPEG - starts with pack header
	{"mpeg", 0, []byte{0x00, 0x00, 0x01, 0xBA}},
	// FLV
	{"flv", 0, []byte("FLV")},
}

// StorageConfig holds storage configuration
type StorageConfig struct {
	VideoPath     string
	ThumbnailPath string
	TempPath      string
	ChunksPath    string
}

// Storage handles file storage operations
type Storage struct {
	config StorageConfig
}

// NewStorage creates a new storage service
func NewStorage(cfg StorageConfig) *Storage {
	return &Storage{config: cfg}
}

// EnsureDirectories creates all required storage directories
func (s *Storage) EnsureDirectories() error {
	dirs := []string{
		s.config.VideoPath,
		s.config.ThumbnailPath,
		s.config.TempPath,
		s.config.ChunksPath,
	}

	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("failed to create directory %s: %w", dir, err)
		}
		log.Printf("Ensured directory exists: %s", dir)
	}

	return nil
}

// GenerateUniqueFilename generates a unique filename: {uuid}_{timestamp}.{ext}
func GenerateUniqueFilename(originalFilename string) string {
	ext := strings.ToLower(filepath.Ext(originalFilename))
	if ext == "" {
		ext = ".mp4" // Default to .mp4 if no extension
	}

	uniqueID := uuid.New().String()
	timestamp := time.Now().UTC().Format("20060102150405")

	return fmt.Sprintf("%s_%s%s", uniqueID, timestamp, ext)
}

// GetFilenameWithoutExt returns the filename stem without extension
func GetFilenameWithoutExt(filename string) string {
	return strings.TrimSuffix(filename, filepath.Ext(filename))
}

// SaveUploadedFile saves an uploaded file to the specified path
func (s *Storage) SaveUploadedFile(src io.Reader, destPath string) (int64, error) {
	// Ensure parent directory exists
	if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
		return 0, fmt.Errorf("failed to create directory: %w", err)
	}

	dest, err := os.Create(destPath)
	if err != nil {
		return 0, fmt.Errorf("failed to create file: %w", err)
	}
	defer dest.Close()

	written, err := io.Copy(dest, src)
	if err != nil {
		// Clean up partial file
		os.Remove(destPath)
		return 0, fmt.Errorf("failed to write file: %w", err)
	}

	log.Printf("Saved file to %s (%d bytes)", destPath, written)
	return written, nil
}

// TempPath returns the full path for a temp file
func (s *Storage) TempPath(filename string) string {
	return filepath.Join(s.config.TempPath, filename)
}

// VideoPath returns the full path for a video file
func (s *Storage) VideoPath(filename string) string {
	return filepath.Join(s.config.VideoPath, filename)
}

// ThumbnailPath returns the full path for a thumbnail file
func (s *Storage) ThumbnailPath(filename string) string {
	return filepath.Join(s.config.ThumbnailPath, filename)
}

// ChunksPath returns the full path for chunk storage
func (s *Storage) ChunksPath(uploadID string) string {
	return filepath.Join(s.config.ChunksPath, uploadID)
}

// DeleteFile removes a file from disk
func (s *Storage) DeleteFile(path string) error {
	if _, err := os.Stat(path); os.IsNotExist(err) {
		log.Printf("File doesn't exist, cannot delete: %s", path)
		return nil
	}

	if err := os.Remove(path); err != nil {
		return fmt.Errorf("failed to delete file: %w", err)
	}

	log.Printf("Deleted file: %s", path)
	return nil
}

// DeleteDirectory removes a directory and all its contents
func (s *Storage) DeleteDirectory(path string) error {
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return nil
	}

	if err := os.RemoveAll(path); err != nil {
		return fmt.Errorf("failed to delete directory: %w", err)
	}

	log.Printf("Deleted directory: %s", path)
	return nil
}

// MoveFile moves a file from source to destination
func (s *Storage) MoveFile(src, dest string) error {
	// Ensure destination directory exists
	if err := os.MkdirAll(filepath.Dir(dest), 0755); err != nil {
		return fmt.Errorf("failed to create destination directory: %w", err)
	}

	if err := os.Rename(src, dest); err != nil {
		return fmt.Errorf("failed to move file: %w", err)
	}

	log.Printf("Moved file from %s to %s", src, dest)
	return nil
}

// FileExists checks if a file exists
func FileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// GetFileSize returns the size of a file in bytes
func GetFileSize(path string) (int64, error) {
	info, err := os.Stat(path)
	if err != nil {
		return 0, err
	}
	return info.Size(), nil
}

// ValidateVideoFile checks if a file is a valid video by examining magic bytes
func ValidateVideoFile(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	// Read first 12 bytes (enough for all signatures)
	header := make([]byte, 12)
	n, err := file.Read(header)
	if err != nil && err != io.EOF {
		return fmt.Errorf("failed to read file header: %w", err)
	}
	if n < 4 {
		return fmt.Errorf("file too small to be a valid video")
	}

	// Check against known video signatures
	for _, sig := range videoSignatures {
		if sig.offset+len(sig.pattern) <= n {
			if bytes.Equal(header[sig.offset:sig.offset+len(sig.pattern)], sig.pattern) {
				return nil // Valid video signature found
			}
		}
	}

	return fmt.Errorf("file does not appear to be a valid video (unrecognized format)")
}

// GetHLSDirectoryName returns the HLS directory name for a video (stem without extension)
func GetHLSDirectoryName(filename string) string {
	return GetFilenameWithoutExt(filename)
}

// IsHLSVideo checks if a video has HLS files
func (s *Storage) IsHLSVideo(filename string) bool {
	hlsDir := filepath.Join(s.config.VideoPath, GetHLSDirectoryName(filename))
	manifestPath := filepath.Join(hlsDir, "master.m3u8")
	return FileExists(manifestPath)
}

// DeleteVideoFiles deletes all files associated with a video (HLS dir, MP4, thumbnail)
func (s *Storage) DeleteVideoFiles(filename string, thumbnailFilename *string, storagePath *string) error {
	var errs []string

	// Determine video base path
	videoBase := s.config.VideoPath
	if storagePath != nil && *storagePath != "" {
		videoBase = *storagePath
	}

	// Try to delete HLS directory
	hlsDir := filepath.Join(videoBase, GetHLSDirectoryName(filename))
	if err := s.DeleteDirectory(hlsDir); err != nil {
		errs = append(errs, fmt.Sprintf("HLS dir: %v", err))
	}

	// Try to delete progressive MP4
	mp4Path := filepath.Join(videoBase, filename)
	if !strings.HasSuffix(mp4Path, ".mp4") {
		mp4Path = mp4Path + ".mp4"
	}
	if err := s.DeleteFile(mp4Path); err != nil {
		errs = append(errs, fmt.Sprintf("MP4: %v", err))
	}

	// Also try without adding extension (for files that already have it)
	mp4PathOriginal := filepath.Join(videoBase, filename)
	if mp4PathOriginal != mp4Path {
		s.DeleteFile(mp4PathOriginal) // Ignore error
	}

	// Delete thumbnail if exists
	if thumbnailFilename != nil && *thumbnailFilename != "" {
		thumbPath := s.ThumbnailPath(*thumbnailFilename)
		if err := s.DeleteFile(thumbPath); err != nil {
			errs = append(errs, fmt.Sprintf("thumbnail: %v", err))
		}
	}

	if len(errs) > 0 {
		log.Printf("Some video files could not be deleted: %v", errs)
	}

	return nil
}

// Config returns the storage configuration
func (s *Storage) Config() StorageConfig {
	return s.config
}

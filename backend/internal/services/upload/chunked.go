// Package upload provides chunked file upload management.
package upload

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sort"

	"github.com/google/uuid"
)

// ChunkedUploadManager handles chunked file uploads
type ChunkedUploadManager struct {
	basePath string
}

// NewChunkedUploadManager creates a new chunked upload manager
func NewChunkedUploadManager(basePath string) *ChunkedUploadManager {
	return &ChunkedUploadManager{basePath: basePath}
}

// InitSession creates a new upload session and returns a unique ID
func (m *ChunkedUploadManager) InitSession() (string, error) {
	uploadID := uuid.New().String()
	sessionPath := m.sessionPath(uploadID)

	if err := os.MkdirAll(sessionPath, 0755); err != nil {
		return "", fmt.Errorf("failed to create session directory: %w", err)
	}

	log.Printf("Initialized chunked upload session: %s", uploadID)
	return uploadID, nil
}

// SessionExists checks if an upload session exists
func (m *ChunkedUploadManager) SessionExists(uploadID string) bool {
	sessionPath := m.sessionPath(uploadID)
	info, err := os.Stat(sessionPath)
	return err == nil && info.IsDir()
}

// SaveChunk saves a single chunk to disk
func (m *ChunkedUploadManager) SaveChunk(uploadID string, chunkIndex int, data []byte) error {
	sessionPath := m.sessionPath(uploadID)

	if !m.SessionExists(uploadID) {
		return fmt.Errorf("upload session not found: %s", uploadID)
	}

	chunkPath := filepath.Join(sessionPath, fmt.Sprintf("chunk_%05d", chunkIndex))
	if err := os.WriteFile(chunkPath, data, 0644); err != nil {
		return fmt.Errorf("failed to save chunk: %w", err)
	}

	log.Printf("Saved chunk %d for upload %s (%d bytes)", chunkIndex, uploadID, len(data))
	return nil
}

// SaveChunkFromReader saves a chunk from a reader
func (m *ChunkedUploadManager) SaveChunkFromReader(uploadID string, chunkIndex int, reader io.Reader) (int64, error) {
	sessionPath := m.sessionPath(uploadID)

	if !m.SessionExists(uploadID) {
		return 0, fmt.Errorf("upload session not found: %s", uploadID)
	}

	chunkPath := filepath.Join(sessionPath, fmt.Sprintf("chunk_%05d", chunkIndex))
	file, err := os.Create(chunkPath)
	if err != nil {
		return 0, fmt.Errorf("failed to create chunk file: %w", err)
	}
	defer file.Close()

	written, err := io.Copy(file, reader)
	if err != nil {
		os.Remove(chunkPath) // Clean up partial file
		return 0, fmt.Errorf("failed to write chunk: %w", err)
	}

	log.Printf("Saved chunk %d for upload %s (%d bytes)", chunkIndex, uploadID, written)
	return written, nil
}

// MergeChunks merges all chunks in a session into a single file
func (m *ChunkedUploadManager) MergeChunks(uploadID string, destPath string) (int64, error) {
	sessionPath := m.sessionPath(uploadID)

	if !m.SessionExists(uploadID) {
		return 0, fmt.Errorf("upload session not found: %s", uploadID)
	}

	// List and sort chunks
	chunks, err := m.listChunks(sessionPath)
	if err != nil {
		return 0, fmt.Errorf("failed to list chunks: %w", err)
	}

	if len(chunks) == 0 {
		return 0, fmt.Errorf("no chunks found for upload: %s", uploadID)
	}

	// Ensure destination directory exists
	if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
		return 0, fmt.Errorf("failed to create destination directory: %w", err)
	}

	// Create destination file
	destFile, err := os.Create(destPath)
	if err != nil {
		return 0, fmt.Errorf("failed to create destination file: %w", err)
	}
	defer destFile.Close()

	// Merge chunks
	var totalSize int64
	for _, chunkPath := range chunks {
		chunkFile, err := os.Open(chunkPath)
		if err != nil {
			os.Remove(destPath) // Clean up partial file
			return 0, fmt.Errorf("failed to open chunk: %w", err)
		}

		written, err := io.Copy(destFile, chunkFile)
		chunkFile.Close()

		if err != nil {
			os.Remove(destPath)
			return 0, fmt.Errorf("failed to copy chunk: %w", err)
		}

		totalSize += written
	}

	log.Printf("Merged %d chunks for upload %s into %s (%d bytes)", len(chunks), uploadID, destPath, totalSize)
	return totalSize, nil
}

// CleanupSession deletes a chunked upload session and all its chunks
func (m *ChunkedUploadManager) CleanupSession(uploadID string) error {
	sessionPath := m.sessionPath(uploadID)

	if !m.SessionExists(uploadID) {
		return nil // Already cleaned up
	}

	if err := os.RemoveAll(sessionPath); err != nil {
		return fmt.Errorf("failed to cleanup session: %w", err)
	}

	log.Printf("Cleaned up chunked upload session: %s", uploadID)
	return nil
}

// GetChunkCount returns the number of chunks in a session
func (m *ChunkedUploadManager) GetChunkCount(uploadID string) (int, error) {
	sessionPath := m.sessionPath(uploadID)

	chunks, err := m.listChunks(sessionPath)
	if err != nil {
		return 0, err
	}

	return len(chunks), nil
}

// sessionPath returns the full path for a session directory
func (m *ChunkedUploadManager) sessionPath(uploadID string) string {
	return filepath.Join(m.basePath, uploadID)
}

// listChunks returns sorted chunk file paths
func (m *ChunkedUploadManager) listChunks(sessionPath string) ([]string, error) {
	entries, err := os.ReadDir(sessionPath)
	if err != nil {
		return nil, err
	}

	var chunks []string
	for _, entry := range entries {
		if !entry.IsDir() && len(entry.Name()) > 6 && entry.Name()[:6] == "chunk_" {
			chunks = append(chunks, filepath.Join(sessionPath, entry.Name()))
		}
	}

	sort.Strings(chunks)
	return chunks, nil
}

// EnsureBasePath creates the base directory if it doesn't exist
func (m *ChunkedUploadManager) EnsureBasePath() error {
	if err := os.MkdirAll(m.basePath, 0755); err != nil {
		return fmt.Errorf("failed to create chunks directory: %w", err)
	}
	return nil
}

package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	gonanoid "github.com/matoous/go-nanoid/v2"

	"github.com/clipset/clipset-go/internal/api/middleware"
	"github.com/clipset/clipset-go/internal/api/response"
	"github.com/clipset/clipset-go/internal/config"
	"github.com/clipset/clipset-go/internal/db"
	"github.com/clipset/clipset-go/internal/db/sqlc"
	"github.com/clipset/clipset-go/internal/domain"
	"github.com/clipset/clipset-go/internal/services/auth"
	"github.com/clipset/clipset-go/internal/services/storage"
	"github.com/clipset/clipset-go/internal/services/upload"
)

// Short ID character set (alphanumeric)
const shortIDAlphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
const shortIDLength = 8
const maxShortIDRetries = 5

// EnqueueFunc is a function type for enqueueing transcode jobs
type EnqueueFunc func(ctx context.Context, videoID string) error

// VideosHandler handles video management endpoints
type VideosHandler struct {
	db           *db.DB
	config       *config.Config
	storage      *storage.Storage
	chunkManager *upload.ChunkedUploadManager
	enqueueJob   EnqueueFunc // Optional function to enqueue transcode jobs
}

// NewVideosHandler creates a new videos handler
func NewVideosHandler(database *db.DB, cfg *config.Config, stor *storage.Storage, chunkMgr *upload.ChunkedUploadManager) *VideosHandler {
	return &VideosHandler{
		db:           database,
		config:       cfg,
		storage:      stor,
		chunkManager: chunkMgr,
		enqueueJob:   nil, // Set via SetEnqueueFunc after worker is initialized
	}
}

// SetEnqueueFunc sets the function used to enqueue transcode jobs
// This should be called after the worker is initialized in main.go
func (h *VideosHandler) SetEnqueueFunc(fn EnqueueFunc) {
	h.enqueueJob = fn
}

// Response types matching Python schemas for frontend compatibility

// VideoResponse represents a single video with all details
type VideoResponse struct {
	ID                string    `json:"id"`
	ShortID           string    `json:"short_id"`
	Title             string    `json:"title"`
	Description       *string   `json:"description"`
	Filename          string    `json:"filename"`
	ThumbnailFilename *string   `json:"thumbnail_filename"`
	OriginalFilename  string    `json:"original_filename"`
	StoragePath       *string   `json:"storage_path"`
	FileSizeBytes     int64     `json:"file_size_bytes"`
	DurationSeconds   *int32    `json:"duration_seconds"`
	UploadedBy        string    `json:"uploaded_by"`
	CategoryID        *string   `json:"category_id"`
	ViewCount         int32     `json:"view_count"`
	ProcessingStatus  string    `json:"processing_status"`
	ErrorMessage      *string   `json:"error_message"`
	CreatedAt         time.Time `json:"created_at"`
	// Joined data
	UploaderUsername string  `json:"uploader_username"`
	CategoryName     *string `json:"category_name"`
	CategorySlug     *string `json:"category_slug"`
}

// VideoListResponse represents paginated video list
type VideoListResponse struct {
	Videos []VideoResponse `json:"videos"`
	Total  int64           `json:"total"`
}

// VideoUpdateRequest represents the update video request
type VideoUpdateRequest struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
	CategoryID  *string `json:"category_id"`
}

// QuotaInfoResponse represents user quota information
type QuotaInfoResponse struct {
	UsedBytes        int64   `json:"used_bytes"`
	LimitBytes       int64   `json:"limit_bytes"`
	RemainingBytes   int64   `json:"remaining_bytes"`
	PercentageUsed   float64 `json:"percentage_used"`
	CanUpload        bool    `json:"can_upload"`
	MaxFileSizeBytes int64   `json:"max_file_size_bytes"`
}

// QuotaResetResponse represents the quota reset response
type QuotaResetResponse struct {
	ResetCount int    `json:"reset_count"`
	Message    string `json:"message"`
}

// StreamInfoResponse represents streaming availability information
type StreamInfoResponse struct {
	Format           string  `json:"format"`                      // "hls", "progressive", "unknown"
	ManifestURL      *string `json:"manifest_url,omitempty"`      // URL to HLS manifest
	StreamURL        *string `json:"stream_url,omitempty"`        // URL to progressive stream
	Ready            bool    `json:"ready"`                       // Whether the video is ready to stream
	ProcessingStatus *string `json:"processing_status,omitempty"` // Status if not ready
}

// ViewCountResponse represents the view count after increment
type ViewCountResponse struct {
	ViewCount int32 `json:"view_count"`
}

// ChunkUploadInitRequest represents chunked upload init request
type ChunkUploadInitRequest struct {
	ExpectedSize int64  `json:"expected_size"`
	Filename     string `json:"filename"`
}

// ChunkUploadInitResponse represents chunked upload init response
type ChunkUploadInitResponse struct {
	UploadID string `json:"upload_id"`
}

// ChunkUploadCompleteRequest represents chunked upload complete request
type ChunkUploadCompleteRequest struct {
	UploadID    string  `json:"upload_id"`
	Title       string  `json:"title"`
	Description *string `json:"description"`
	CategoryID  *string `json:"category_id"`
	Filename    string  `json:"filename"`
}

// Helper functions

// generateUniqueShortID generates a unique short ID with retry logic
func (h *VideosHandler) generateUniqueShortID(ctx context.Context) (string, error) {
	for i := 0; i < maxShortIDRetries; i++ {
		shortID, err := gonanoid.Generate(shortIDAlphabet, shortIDLength)
		if err != nil {
			return "", fmt.Errorf("failed to generate short ID: %w", err)
		}

		exists, err := h.db.Queries.VideoExistsByShortID(ctx, shortID)
		if err != nil {
			return "", fmt.Errorf("failed to check short ID: %w", err)
		}

		if !exists {
			return shortID, nil
		}

		log.Printf("Short ID collision, retrying (%d/%d)", i+1, maxShortIDRetries)
	}

	return "", fmt.Errorf("failed to generate unique short ID after %d attempts", maxShortIDRetries)
}

// getDBConfig gets config from database, falling back to env config
func (h *VideosHandler) getDBConfig(ctx context.Context) (maxFileSize int64, weeklyLimit int64, videoStoragePath string) {
	dbConfig, err := h.db.Queries.GetConfig(ctx)
	if err != nil {
		log.Printf("Warning: failed to get DB config, using env defaults: %v", err)
		return h.config.MaxFileSizeBytes, h.config.WeeklyUploadLimit, h.config.VideoStoragePath
	}

	return dbConfig.MaxFileSizeBytes, dbConfig.WeeklyUploadLimitBytes, dbConfig.VideoStoragePath
}

// checkUserQuota checks if user can upload a file of given size
func (h *VideosHandler) checkUserQuota(ctx context.Context, userID uuid.UUID, fileSize int64) (bool, string) {
	_, weeklyLimit, _ := h.getDBConfig(ctx)

	quota, err := h.db.Queries.GetUserQuota(ctx, userID)
	if err != nil {
		log.Printf("Warning: failed to get user quota: %v", err)
		return true, "" // Allow upload if quota check fails
	}

	wouldUse := quota.WeeklyUploadBytes + fileSize
	if wouldUse > weeklyLimit {
		usedGB := float64(quota.WeeklyUploadBytes) / (1024 * 1024 * 1024)
		limitGB := float64(weeklyLimit) / (1024 * 1024 * 1024)
		fileGB := float64(fileSize) / (1024 * 1024 * 1024)
		return false, fmt.Sprintf("Upload would exceed weekly quota. Used: %.2f GB / %.2f GB. File size: %.2f GB", usedGB, limitGB, fileGB)
	}

	return true, ""
}

// triggerProcessing enqueues a video for background transcoding
func (h *VideosHandler) triggerProcessing(ctx context.Context, videoID uuid.UUID) {
	if h.enqueueJob == nil {
		log.Printf("Warning: video %s uploaded but no enqueue function set - processing skipped", videoID)
		return
	}

	if err := h.enqueueJob(ctx, videoID.String()); err != nil {
		log.Printf("Error enqueueing transcode job for video %s: %v", videoID, err)
		// Don't fail the upload - the video is saved, just not processed yet
		// An admin can manually trigger reprocessing later
	}
}

// buildVideoResponse converts DB row to API response
func buildVideoResponse(v sqlc.ListVideosWithAccessRow) VideoResponse {
	var categoryID *string
	if v.CategoryID.Valid {
		id := v.CategoryID.Bytes
		idStr := uuid.UUID(id).String()
		categoryID = &idStr
	}

	return VideoResponse{
		ID:                v.ID.String(),
		ShortID:           v.ShortID,
		Title:             v.Title,
		Description:       v.Description,
		Filename:          v.Filename,
		ThumbnailFilename: v.ThumbnailFilename,
		OriginalFilename:  v.OriginalFilename,
		StoragePath:       v.StoragePath,
		FileSizeBytes:     v.FileSizeBytes,
		DurationSeconds:   v.DurationSeconds,
		UploadedBy:        v.UploadedBy.String(),
		CategoryID:        categoryID,
		ViewCount:         v.ViewCount,
		ProcessingStatus:  string(v.ProcessingStatus),
		ErrorMessage:      v.ErrorMessage,
		CreatedAt:         v.CreatedAt,
		UploaderUsername:  v.UploaderUsername,
		CategoryName:      v.CategoryName,
		CategorySlug:      v.CategorySlug,
	}
}

// buildVideoResponseFromShortIDRow converts GetVideoByShortIDWithUploaderRow to API response
func buildVideoResponseFromShortIDRow(v sqlc.GetVideoByShortIDWithUploaderRow) VideoResponse {
	var categoryID *string
	if v.CategoryID.Valid {
		id := v.CategoryID.Bytes
		idStr := uuid.UUID(id).String()
		categoryID = &idStr
	}

	return VideoResponse{
		ID:                v.ID.String(),
		ShortID:           v.ShortID,
		Title:             v.Title,
		Description:       v.Description,
		Filename:          v.Filename,
		ThumbnailFilename: v.ThumbnailFilename,
		OriginalFilename:  v.OriginalFilename,
		StoragePath:       v.StoragePath,
		FileSizeBytes:     v.FileSizeBytes,
		DurationSeconds:   v.DurationSeconds,
		UploadedBy:        v.UploadedBy.String(),
		CategoryID:        categoryID,
		ViewCount:         v.ViewCount,
		ProcessingStatus:  string(v.ProcessingStatus),
		ErrorMessage:      v.ErrorMessage,
		CreatedAt:         v.CreatedAt,
		UploaderUsername:  v.UploaderUsername,
		CategoryName:      v.CategoryName,
		CategorySlug:      v.CategorySlug,
	}
}

// buildVideoResponseFromIDRow converts GetVideoByIDWithUploaderRow to API response
func buildVideoResponseFromIDRow(v sqlc.GetVideoByIDWithUploaderRow) VideoResponse {
	var categoryID *string
	if v.CategoryID.Valid {
		id := v.CategoryID.Bytes
		idStr := uuid.UUID(id).String()
		categoryID = &idStr
	}

	return VideoResponse{
		ID:                v.ID.String(),
		ShortID:           v.ShortID,
		Title:             v.Title,
		Description:       v.Description,
		Filename:          v.Filename,
		ThumbnailFilename: v.ThumbnailFilename,
		OriginalFilename:  v.OriginalFilename,
		StoragePath:       v.StoragePath,
		FileSizeBytes:     v.FileSizeBytes,
		DurationSeconds:   v.DurationSeconds,
		UploadedBy:        v.UploadedBy.String(),
		CategoryID:        categoryID,
		ViewCount:         v.ViewCount,
		ProcessingStatus:  string(v.ProcessingStatus),
		ErrorMessage:      v.ErrorMessage,
		CreatedAt:         v.CreatedAt,
		UploaderUsername:  v.UploaderUsername,
		CategoryName:      v.CategoryName,
		CategorySlug:      v.CategorySlug,
	}
}

// hasVideoAccess checks if user can access a video
func hasVideoAccess(video sqlc.Video, userID uuid.UUID, isAdmin bool) bool {
	if isAdmin {
		return true
	}
	if video.ProcessingStatus == domain.ProcessingStatusCompleted {
		return true
	}
	return video.UploadedBy == userID
}

// isVideoOwnerOrAdmin checks if user is the video owner or admin
func isVideoOwnerOrAdmin(video sqlc.Video, userID uuid.UUID, isAdmin bool) bool {
	return isAdmin || video.UploadedBy == userID
}

// Handlers

// Upload handles POST /api/videos/upload
func (h *VideosHandler) Upload(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Get current user
	userID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	// Parse multipart form (max 2GB)
	maxSize := h.config.MaxFileSizeBytes
	if maxSize == 0 {
		maxSize = 2 << 30 // 2GB default
	}
	if err := r.ParseMultipartForm(maxSize); err != nil {
		response.BadRequest(w, "Failed to parse form data or file too large")
		return
	}

	// Get form values
	title := strings.TrimSpace(r.FormValue("title"))
	description := r.FormValue("description")
	categoryIDStr := r.FormValue("category_id")

	// Validate title
	if title == "" {
		response.BadRequest(w, "Title is required")
		return
	}
	if len(title) > 200 {
		response.BadRequest(w, "Title must be 200 characters or less")
		return
	}

	// Validate description
	if len(description) > 2000 {
		response.BadRequest(w, "Description must be 2000 characters or less")
		return
	}

	// Get file from form
	file, header, err := r.FormFile("file")
	if err != nil {
		response.BadRequest(w, "No file provided")
		return
	}
	defer file.Close()

	// Validate file extension
	ext := filepath.Ext(header.Filename)
	if !h.config.IsAcceptedVideoFormat(ext) {
		response.BadRequest(w, fmt.Sprintf("Invalid file type. Accepted formats: %s", h.config.AcceptedFormatsString()))
		return
	}

	// Get DB config
	maxFileSize, _, videoStoragePath := h.getDBConfig(ctx)

	// Check file size
	if header.Size > maxFileSize {
		response.BadRequest(w, fmt.Sprintf("File too large. Maximum size: %.2f GB", float64(maxFileSize)/(1024*1024*1024)))
		return
	}

	// Check user quota
	canUpload, reason := h.checkUserQuota(ctx, userID, header.Size)
	if !canUpload {
		response.Forbidden(w, reason)
		return
	}

	// Validate category if provided
	var categoryID pgtype.UUID
	if categoryIDStr != "" {
		catID, err := uuid.Parse(categoryIDStr)
		if err != nil {
			response.BadRequest(w, "Invalid category ID format")
			return
		}

		_, err = h.db.Queries.GetCategoryByID(ctx, catID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				response.NotFound(w, "Category not found")
				return
			}
			log.Printf("Error checking category: %v", err)
			response.InternalServerError(w, "Failed to validate category")
			return
		}

		categoryID = pgtype.UUID{Bytes: catID, Valid: true}
	}

	// Generate unique filename
	uniqueFilename := storage.GenerateUniqueFilename(header.Filename)
	tempPath := h.storage.TempPath(uniqueFilename)

	// Save file to temp storage
	bytesWritten, err := h.storage.SaveUploadedFile(file, tempPath)
	if err != nil {
		log.Printf("Error saving uploaded file: %v", err)
		response.InternalServerError(w, "Failed to save uploaded file")
		return
	}

	// Validate it's actually a video file
	if err := storage.ValidateVideoFile(tempPath); err != nil {
		h.storage.DeleteFile(tempPath)
		response.BadRequest(w, "File does not appear to be a valid video")
		return
	}

	// Generate short ID
	shortID, err := h.generateUniqueShortID(ctx)
	if err != nil {
		h.storage.DeleteFile(tempPath)
		log.Printf("Error generating short ID: %v", err)
		response.InternalServerError(w, "Failed to generate video ID")
		return
	}

	// Prepare description
	var desc *string
	if description != "" {
		trimmedDesc := strings.TrimSpace(description)
		desc = &trimmedDesc
	}

	// Create video record
	video, err := h.db.Queries.CreateVideo(ctx, sqlc.CreateVideoParams{
		ShortID:          shortID,
		Title:            title,
		Description:      desc,
		Filename:         uniqueFilename,
		OriginalFilename: header.Filename,
		FileSizeBytes:    bytesWritten,
		UploadedBy:       userID,
		CategoryID:       categoryID,
		StoragePath:      &videoStoragePath,
	})
	if err != nil {
		h.storage.DeleteFile(tempPath)
		log.Printf("Error creating video record: %v", err)
		response.InternalServerError(w, "Failed to create video record")
		return
	}

	// Increment user quota
	if err := h.db.Queries.UpdateUploadQuota(ctx, sqlc.UpdateUploadQuotaParams{
		ID:                userID,
		WeeklyUploadBytes: bytesWritten,
	}); err != nil {
		log.Printf("Warning: failed to update user quota: %v", err)
	}

	// Trigger background processing
	h.triggerProcessing(ctx, video.ID)

	log.Printf("Video uploaded successfully: %s by user %s", video.ID, userID)

	// Get full video response with uploader info
	videoWithUploader, err := h.db.Queries.GetVideoByIDWithUploader(ctx, video.ID)
	if err != nil {
		log.Printf("Warning: failed to get video with uploader: %v", err)
		// Return basic response
		response.Created(w, map[string]interface{}{
			"id":       video.ID.String(),
			"short_id": video.ShortID,
			"title":    video.Title,
		})
		return
	}

	response.Created(w, buildVideoResponseFromIDRow(videoWithUploader))
}

// InitChunkedUpload handles POST /api/videos/upload/init
func (h *VideosHandler) InitChunkedUpload(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Get current user
	userID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	// Parse request
	var req ChunkUploadInitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "Invalid request body")
		return
	}

	// Validate filename
	if req.Filename == "" {
		response.BadRequest(w, "Filename is required")
		return
	}

	ext := filepath.Ext(req.Filename)
	if !h.config.IsAcceptedVideoFormat(ext) {
		response.BadRequest(w, fmt.Sprintf("Invalid file type. Accepted formats: %s", h.config.AcceptedFormatsString()))
		return
	}

	// Validate expected size
	if req.ExpectedSize <= 0 {
		response.BadRequest(w, "Expected size must be positive")
		return
	}

	// Get DB config
	maxFileSize, _, _ := h.getDBConfig(ctx)

	// Pre-check file size
	if req.ExpectedSize > maxFileSize {
		response.BadRequest(w, fmt.Sprintf("File too large. Maximum size: %.2f GB", float64(maxFileSize)/(1024*1024*1024)))
		return
	}

	// Pre-check user quota
	canUpload, reason := h.checkUserQuota(ctx, userID, req.ExpectedSize)
	if !canUpload {
		response.Forbidden(w, reason)
		return
	}

	// Initialize upload session
	uploadID, err := h.chunkManager.InitSession()
	if err != nil {
		log.Printf("Error initializing upload session: %v", err)
		response.InternalServerError(w, "Failed to initialize upload")
		return
	}

	log.Printf("Initialized chunked upload session %s for user %s", uploadID, userID)

	response.OK(w, ChunkUploadInitResponse{UploadID: uploadID})
}

// UploadChunk handles POST /api/videos/upload/chunk
func (h *VideosHandler) UploadChunk(w http.ResponseWriter, r *http.Request) {
	// Get current user
	_, ok := middleware.GetUserID(r.Context())
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	// Parse multipart form (max 100MB per chunk)
	if err := r.ParseMultipartForm(100 << 20); err != nil {
		response.BadRequest(w, "Failed to parse form data")
		return
	}

	uploadID := r.FormValue("upload_id")
	chunkIndexStr := r.FormValue("chunk_index")

	if uploadID == "" {
		response.BadRequest(w, "Upload ID is required")
		return
	}

	chunkIndex, err := strconv.Atoi(chunkIndexStr)
	if err != nil {
		response.BadRequest(w, "Invalid chunk index")
		return
	}

	// Check session exists
	if !h.chunkManager.SessionExists(uploadID) {
		response.NotFound(w, "Upload session not found")
		return
	}

	// Get file from form
	file, _, err := r.FormFile("file")
	if err != nil {
		response.BadRequest(w, "No file provided")
		return
	}
	defer file.Close()

	// Save chunk
	_, err = h.chunkManager.SaveChunkFromReader(uploadID, chunkIndex, file)
	if err != nil {
		log.Printf("Error saving chunk: %v", err)
		response.InternalServerError(w, "Failed to save chunk")
		return
	}

	response.NoContent(w)
}

// CompleteChunkedUpload handles POST /api/videos/upload/complete
func (h *VideosHandler) CompleteChunkedUpload(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Get current user
	userID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	// Parse request
	var req ChunkUploadCompleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "Invalid request body")
		return
	}

	// Validate request
	if req.UploadID == "" {
		response.BadRequest(w, "Upload ID is required")
		return
	}
	if req.Title == "" {
		response.BadRequest(w, "Title is required")
		return
	}
	if len(req.Title) > 200 {
		response.BadRequest(w, "Title must be 200 characters or less")
		return
	}
	if req.Filename == "" {
		response.BadRequest(w, "Filename is required")
		return
	}

	// Check session exists
	if !h.chunkManager.SessionExists(req.UploadID) {
		response.NotFound(w, "Upload session not found")
		return
	}

	// Generate unique filename
	uniqueFilename := storage.GenerateUniqueFilename(req.Filename)
	tempPath := h.storage.TempPath(uniqueFilename)

	// Merge chunks
	totalSize, err := h.chunkManager.MergeChunks(req.UploadID, tempPath)
	if err != nil {
		log.Printf("Error merging chunks: %v", err)
		h.chunkManager.CleanupSession(req.UploadID)
		response.InternalServerError(w, "Failed to merge chunks")
		return
	}

	// Get DB config
	maxFileSize, _, videoStoragePath := h.getDBConfig(ctx)

	// Validate total size
	if totalSize > maxFileSize {
		h.storage.DeleteFile(tempPath)
		h.chunkManager.CleanupSession(req.UploadID)
		response.BadRequest(w, fmt.Sprintf("File too large. Maximum size: %.2f GB", float64(maxFileSize)/(1024*1024*1024)))
		return
	}

	// Check user quota (final check)
	canUpload, reason := h.checkUserQuota(ctx, userID, totalSize)
	if !canUpload {
		h.storage.DeleteFile(tempPath)
		h.chunkManager.CleanupSession(req.UploadID)
		response.Forbidden(w, reason)
		return
	}

	// Validate it's actually a video file
	if err := storage.ValidateVideoFile(tempPath); err != nil {
		h.storage.DeleteFile(tempPath)
		h.chunkManager.CleanupSession(req.UploadID)
		response.BadRequest(w, "File does not appear to be a valid video")
		return
	}

	// Validate category if provided
	var categoryID pgtype.UUID
	if req.CategoryID != nil && *req.CategoryID != "" {
		catID, err := uuid.Parse(*req.CategoryID)
		if err != nil {
			h.storage.DeleteFile(tempPath)
			h.chunkManager.CleanupSession(req.UploadID)
			response.BadRequest(w, "Invalid category ID format")
			return
		}

		_, err = h.db.Queries.GetCategoryByID(ctx, catID)
		if err != nil {
			h.storage.DeleteFile(tempPath)
			h.chunkManager.CleanupSession(req.UploadID)
			if errors.Is(err, pgx.ErrNoRows) {
				response.NotFound(w, "Category not found")
				return
			}
			log.Printf("Error checking category: %v", err)
			response.InternalServerError(w, "Failed to validate category")
			return
		}

		categoryID = pgtype.UUID{Bytes: catID, Valid: true}
	}

	// Generate short ID
	shortID, err := h.generateUniqueShortID(ctx)
	if err != nil {
		h.storage.DeleteFile(tempPath)
		h.chunkManager.CleanupSession(req.UploadID)
		log.Printf("Error generating short ID: %v", err)
		response.InternalServerError(w, "Failed to generate video ID")
		return
	}

	// Create video record
	video, err := h.db.Queries.CreateVideo(ctx, sqlc.CreateVideoParams{
		ShortID:          shortID,
		Title:            strings.TrimSpace(req.Title),
		Description:      req.Description,
		Filename:         uniqueFilename,
		OriginalFilename: req.Filename,
		FileSizeBytes:    totalSize,
		UploadedBy:       userID,
		CategoryID:       categoryID,
		StoragePath:      &videoStoragePath,
	})
	if err != nil {
		h.storage.DeleteFile(tempPath)
		h.chunkManager.CleanupSession(req.UploadID)
		log.Printf("Error creating video record: %v", err)
		response.InternalServerError(w, "Failed to create video record")
		return
	}

	// Increment user quota
	if err := h.db.Queries.UpdateUploadQuota(ctx, sqlc.UpdateUploadQuotaParams{
		ID:                userID,
		WeeklyUploadBytes: totalSize,
	}); err != nil {
		log.Printf("Warning: failed to update user quota: %v", err)
	}

	// Cleanup session
	h.chunkManager.CleanupSession(req.UploadID)

	// Trigger background processing
	h.triggerProcessing(ctx, video.ID)

	log.Printf("Chunked upload completed: %s by user %s", video.ID, userID)

	// Get full video response with uploader info
	videoWithUploader, err := h.db.Queries.GetVideoByIDWithUploader(ctx, video.ID)
	if err != nil {
		log.Printf("Warning: failed to get video with uploader: %v", err)
		response.Created(w, map[string]interface{}{
			"id":       video.ID.String(),
			"short_id": video.ShortID,
			"title":    video.Title,
		})
		return
	}

	response.Created(w, buildVideoResponseFromIDRow(videoWithUploader))
}

// List handles GET /api/videos/
func (h *VideosHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Get current user
	userID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	isAdmin := middleware.IsAdmin(ctx)

	// Parse query parameters
	categoryIDStr := r.URL.Query().Get("category_id")
	status := r.URL.Query().Get("status")
	uploadedByStr := r.URL.Query().Get("uploaded_by")
	search := r.URL.Query().Get("search")
	sortBy := r.URL.Query().Get("sort")
	order := r.URL.Query().Get("order")
	skipStr := r.URL.Query().Get("skip")
	limitStr := r.URL.Query().Get("limit")

	// Defaults
	if sortBy == "" {
		sortBy = "created_at"
	}
	if order == "" {
		order = "desc"
	}

	skip := 0
	if skipStr != "" {
		if v, err := strconv.Atoi(skipStr); err == nil && v >= 0 {
			skip = v
		}
	}

	limit := 20
	if limitStr != "" {
		if v, err := strconv.Atoi(limitStr); err == nil && v > 0 && v <= 100 {
			limit = v
		}
	}

	// Parse category ID
	var categoryID uuid.UUID
	if categoryIDStr != "" {
		var err error
		categoryID, err = uuid.Parse(categoryIDStr)
		if err != nil {
			response.BadRequest(w, "Invalid category ID format")
			return
		}
	}

	// Parse uploaded_by
	var uploadedBy uuid.UUID
	if uploadedByStr != "" {
		var err error
		uploadedBy, err = uuid.Parse(uploadedByStr)
		if err != nil {
			response.BadRequest(w, "Invalid uploaded_by format")
			return
		}
	}

	// Non-admins can only filter by status if it's their own videos
	if status != "" && !isAdmin {
		// Silently ignore status filter for non-admins
		status = ""
	}

	// Build query parameters
	listParams := sqlc.ListVideosWithAccessParams{
		Column1:    isAdmin,    // is_admin
		UploadedBy: userID,     // current user for access check
		Column3:    categoryID, // category filter
		Column4:    status,     // status filter
		Column5:    uploadedBy, // uploaded_by filter
		Column6:    search,     // search
		Column7:    sortBy,     // sort column
		Column8:    order,      // sort order
		Limit:      int32(limit),
		Offset:     int32(skip),
	}

	countParams := sqlc.CountVideosWithAccessParams{
		Column1:    isAdmin,
		UploadedBy: userID,
		Column3:    categoryID,
		Column4:    status,
		Column5:    uploadedBy,
		Column6:    search,
	}

	// Execute queries
	videos, err := h.db.Queries.ListVideosWithAccess(ctx, listParams)
	if err != nil {
		log.Printf("Error listing videos: %v", err)
		response.InternalServerError(w, "Failed to list videos")
		return
	}

	total, err := h.db.Queries.CountVideosWithAccess(ctx, countParams)
	if err != nil {
		log.Printf("Error counting videos: %v", err)
		response.InternalServerError(w, "Failed to count videos")
		return
	}

	// Build response
	result := make([]VideoResponse, len(videos))
	for i, v := range videos {
		result[i] = buildVideoResponse(v)
	}

	response.OK(w, VideoListResponse{
		Videos: result,
		Total:  total,
	})
}

// GetByShortID handles GET /api/videos/{short_id}
func (h *VideosHandler) GetByShortID(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	shortID := r.PathValue("short_id")
	if shortID == "" {
		response.BadRequest(w, "Video ID is required")
		return
	}

	// Get current user
	userID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	isAdmin := middleware.IsAdmin(ctx)

	// Get video
	video, err := h.db.Queries.GetVideoByShortID(ctx, shortID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Video not found")
			return
		}
		log.Printf("Error getting video: %v", err)
		response.InternalServerError(w, "Failed to get video")
		return
	}

	// Check access
	if !hasVideoAccess(video, userID, isAdmin) {
		response.Forbidden(w, "You don't have permission to view this video")
		return
	}

	// Get full video with uploader info
	videoWithUploader, err := h.db.Queries.GetVideoByShortIDWithUploader(ctx, shortID)
	if err != nil {
		log.Printf("Error getting video with uploader: %v", err)
		response.InternalServerError(w, "Failed to get video")
		return
	}

	response.OK(w, buildVideoResponseFromShortIDRow(videoWithUploader))
}

// Update handles PATCH /api/videos/{short_id}
func (h *VideosHandler) Update(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	shortID := r.PathValue("short_id")
	if shortID == "" {
		response.BadRequest(w, "Video ID is required")
		return
	}

	// Get current user
	userID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	isAdmin := middleware.IsAdmin(ctx)

	// Get video
	video, err := h.db.Queries.GetVideoByShortID(ctx, shortID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Video not found")
			return
		}
		log.Printf("Error getting video: %v", err)
		response.InternalServerError(w, "Failed to get video")
		return
	}

	// Check permission
	if !isVideoOwnerOrAdmin(video, userID, isAdmin) {
		response.Forbidden(w, "You don't have permission to update this video")
		return
	}

	// Parse request
	var req VideoUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "Invalid request body")
		return
	}

	// Validate title if provided
	title := ""
	if req.Title != nil {
		title = strings.TrimSpace(*req.Title)
		if title == "" {
			response.BadRequest(w, "Title cannot be empty")
			return
		}
		if len(title) > 200 {
			response.BadRequest(w, "Title must be 200 characters or less")
			return
		}
	}

	// Validate description if provided
	var description *string
	if req.Description != nil {
		if len(*req.Description) > 2000 {
			response.BadRequest(w, "Description must be 2000 characters or less")
			return
		}
		trimmedDesc := strings.TrimSpace(*req.Description)
		description = &trimmedDesc
	} else {
		description = video.Description
	}

	// Validate category if provided
	var categoryID pgtype.UUID
	if req.CategoryID != nil {
		if *req.CategoryID == "" {
			// Clear category
			categoryID = pgtype.UUID{Valid: false}
		} else {
			catID, err := uuid.Parse(*req.CategoryID)
			if err != nil {
				response.BadRequest(w, "Invalid category ID format")
				return
			}

			_, err = h.db.Queries.GetCategoryByID(ctx, catID)
			if err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					response.NotFound(w, "Category not found")
					return
				}
				log.Printf("Error checking category: %v", err)
				response.InternalServerError(w, "Failed to validate category")
				return
			}

			categoryID = pgtype.UUID{Bytes: catID, Valid: true}
		}
	} else {
		categoryID = video.CategoryID
	}

	// Update video
	updatedVideo, err := h.db.Queries.UpdateVideo(ctx, sqlc.UpdateVideoParams{
		ID:          video.ID,
		Column2:     title, // Empty string means keep existing
		Description: description,
		CategoryID:  categoryID,
	})
	if err != nil {
		log.Printf("Error updating video: %v", err)
		response.InternalServerError(w, "Failed to update video")
		return
	}

	// Get full video with uploader info
	videoWithUploader, err := h.db.Queries.GetVideoByIDWithUploader(ctx, updatedVideo.ID)
	if err != nil {
		log.Printf("Warning: failed to get updated video with uploader: %v", err)
		response.OK(w, map[string]interface{}{
			"id":       updatedVideo.ID.String(),
			"short_id": updatedVideo.ShortID,
			"title":    updatedVideo.Title,
		})
		return
	}

	response.OK(w, buildVideoResponseFromIDRow(videoWithUploader))
}

// Delete handles DELETE /api/videos/{short_id}
func (h *VideosHandler) Delete(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	shortID := r.PathValue("short_id")
	if shortID == "" {
		response.BadRequest(w, "Video ID is required")
		return
	}

	// Get current user
	userID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	isAdmin := middleware.IsAdmin(ctx)

	// Get video
	video, err := h.db.Queries.GetVideoByShortID(ctx, shortID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Video not found")
			return
		}
		log.Printf("Error getting video: %v", err)
		response.InternalServerError(w, "Failed to get video")
		return
	}

	// Check permission
	if !isVideoOwnerOrAdmin(video, userID, isAdmin) {
		response.Forbidden(w, "You don't have permission to delete this video")
		return
	}

	// Delete video files
	if err := h.storage.DeleteVideoFiles(video.Filename, video.ThumbnailFilename, video.StoragePath); err != nil {
		log.Printf("Warning: failed to delete video files: %v", err)
	}

	// Delete video record
	if err := h.db.Queries.DeleteVideo(ctx, video.ID); err != nil {
		log.Printf("Error deleting video: %v", err)
		response.InternalServerError(w, "Failed to delete video")
		return
	}

	log.Printf("Deleted video %s by user %s", video.ID, userID)

	response.NoContent(w)
}

// GetMyQuota handles GET /api/videos/quota/me
func (h *VideosHandler) GetMyQuota(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Get current user
	userID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	// Get DB config
	maxFileSize, weeklyLimit, _ := h.getDBConfig(ctx)

	// Get user quota
	quota, err := h.db.Queries.GetUserQuota(ctx, userID)
	if err != nil {
		log.Printf("Error getting user quota: %v", err)
		response.InternalServerError(w, "Failed to get quota information")
		return
	}

	used := quota.WeeklyUploadBytes
	remaining := weeklyLimit - used
	if remaining < 0 {
		remaining = 0
	}

	percentage := float64(0)
	if weeklyLimit > 0 {
		percentage = float64(used) / float64(weeklyLimit) * 100
	}

	response.OK(w, QuotaInfoResponse{
		UsedBytes:        used,
		LimitBytes:       weeklyLimit,
		RemainingBytes:   remaining,
		PercentageUsed:   percentage,
		CanUpload:        used < weeklyLimit,
		MaxFileSizeBytes: maxFileSize,
	})
}

// ResetAllQuotas handles POST /api/videos/admin/quota/reset-all
func (h *VideosHandler) ResetAllQuotas(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// This endpoint requires admin (enforced by router middleware)

	// Get count of users before reset
	count, err := h.db.Queries.CountUsers(ctx)
	if err != nil {
		log.Printf("Error counting users: %v", err)
		response.InternalServerError(w, "Failed to reset quotas")
		return
	}

	// Reset all quotas
	if err := h.db.Queries.ResetAllUploadQuotas(ctx); err != nil {
		log.Printf("Error resetting quotas: %v", err)
		response.InternalServerError(w, "Failed to reset quotas")
		return
	}

	log.Printf("Reset quotas for %d users", count)

	response.OK(w, QuotaResetResponse{
		ResetCount: int(count),
		Message:    fmt.Sprintf("Successfully reset quotas for %d users", count),
	})
}

// --- Streaming Handlers (Phase 7) ---

// Thumbnail handles GET /api/videos/{short_id}/thumbnail
func (h *VideosHandler) Thumbnail(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	shortID := r.PathValue("short_id")
	if shortID == "" {
		response.BadRequest(w, "Video ID is required")
		return
	}

	// Get current user for access control
	userID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}
	isAdmin := middleware.IsAdmin(ctx)

	// Get video
	video, err := h.db.Queries.GetVideoByShortID(ctx, shortID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Video not found")
			return
		}
		log.Printf("Error getting video: %v", err)
		response.InternalServerError(w, "Failed to get video")
		return
	}

	// Check access
	if !hasVideoAccess(video, userID, isAdmin) {
		response.Forbidden(w, "You don't have permission to view this video")
		return
	}

	// Check if thumbnail exists
	if video.ThumbnailFilename == nil || *video.ThumbnailFilename == "" {
		response.NotFound(w, "Thumbnail not available")
		return
	}

	thumbnailPath := h.storage.ThumbnailPath(*video.ThumbnailFilename)
	if !storage.FileExists(thumbnailPath) {
		response.NotFound(w, "Thumbnail file not found")
		return
	}

	// Open thumbnail file
	file, err := os.Open(thumbnailPath)
	if err != nil {
		log.Printf("Error opening thumbnail: %v", err)
		response.InternalServerError(w, "Failed to read thumbnail")
		return
	}
	defer file.Close()

	// Get file info for content-length
	stat, err := file.Stat()
	if err != nil {
		log.Printf("Error getting thumbnail stat: %v", err)
		response.InternalServerError(w, "Failed to read thumbnail")
		return
	}

	// Set headers
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Content-Length", strconv.FormatInt(stat.Size(), 10))
	w.Header().Set("Cache-Control", "public, max-age=86400") // 24 hours

	// Stream the file
	io.Copy(w, file)
}

// IncrementView handles POST /api/videos/{short_id}/view
func (h *VideosHandler) IncrementView(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	shortID := r.PathValue("short_id")
	if shortID == "" {
		response.BadRequest(w, "Video ID is required")
		return
	}

	// Get current user (just for authentication, not used for access control on view increment)
	_, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	// Get video
	video, err := h.db.Queries.GetVideoByShortID(ctx, shortID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Video not found")
			return
		}
		log.Printf("Error getting video: %v", err)
		response.InternalServerError(w, "Failed to get video")
		return
	}

	// Increment view count
	newCount, err := h.db.Queries.IncrementViewCount(ctx, video.ID)
	if err != nil {
		log.Printf("Error incrementing view count: %v", err)
		response.InternalServerError(w, "Failed to update view count")
		return
	}

	response.OK(w, ViewCountResponse{ViewCount: newCount})
}

// StreamInfo handles GET /api/videos/{short_id}/stream-info
func (h *VideosHandler) StreamInfo(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	shortID := r.PathValue("short_id")
	if shortID == "" {
		response.BadRequest(w, "Video ID is required")
		return
	}

	// Get current user for access control
	userID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}
	isAdmin := middleware.IsAdmin(ctx)

	// Get video
	video, err := h.db.Queries.GetVideoByShortID(ctx, shortID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Video not found")
			return
		}
		log.Printf("Error getting video: %v", err)
		response.InternalServerError(w, "Failed to get video")
		return
	}

	// Check access
	if !hasVideoAccess(video, userID, isAdmin) {
		response.Forbidden(w, "You don't have permission to view this video")
		return
	}

	// Check if video is ready
	if video.ProcessingStatus != domain.ProcessingStatusCompleted {
		status := string(video.ProcessingStatus)
		response.OK(w, StreamInfoResponse{
			Format:           "unknown",
			Ready:            false,
			ProcessingStatus: &status,
		})
		return
	}

	// Check for HLS availability first (preferred format)
	if h.storage.IsHLSAvailable(video.Filename, video.StoragePath) {
		manifestURL := fmt.Sprintf("/api/videos/%s/hls/master.m3u8", shortID)
		response.OK(w, StreamInfoResponse{
			Format:      "hls",
			ManifestURL: &manifestURL,
			Ready:       true,
		})
		return
	}

	// Check for progressive MP4
	if h.storage.IsProgressiveAvailable(video.Filename, video.StoragePath) {
		streamURL := fmt.Sprintf("/api/videos/%s/stream", shortID)
		response.OK(w, StreamInfoResponse{
			Format:    "progressive",
			StreamURL: &streamURL,
			Ready:     true,
		})
		return
	}

	// No streaming format available
	status := string(video.ProcessingStatus)
	response.OK(w, StreamInfoResponse{
		Format:           "unknown",
		Ready:            false,
		ProcessingStatus: &status,
	})
}

// Stream handles GET /api/videos/{short_id}/stream (progressive streaming with Range support)
func (h *VideosHandler) Stream(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	shortID := r.PathValue("short_id")
	if shortID == "" {
		response.BadRequest(w, "Video ID is required")
		return
	}

	// Get current user for access control
	userID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}
	isAdmin := middleware.IsAdmin(ctx)

	// Get video
	video, err := h.db.Queries.GetVideoByShortID(ctx, shortID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Video not found")
			return
		}
		log.Printf("Error getting video: %v", err)
		response.InternalServerError(w, "Failed to get video")
		return
	}

	// Check access
	if !hasVideoAccess(video, userID, isAdmin) {
		response.Forbidden(w, "You don't have permission to view this video")
		return
	}

	// Open video file
	file, fileSize, err := h.storage.OpenVideoFile(video.Filename, video.StoragePath)
	if err != nil {
		log.Printf("Error opening video file: %v", err)
		response.NotFound(w, "Video file not found")
		return
	}
	defer file.Close()

	// Parse Range header
	rangeHeader := r.Header.Get("Range")

	// Set common headers
	w.Header().Set("Content-Type", "video/mp4")
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Content-Encoding", "identity")
	w.Header().Set("Access-Control-Expose-Headers", "content-type, accept-ranges, content-length, content-range, content-encoding")

	if rangeHeader == "" {
		// No Range header - send full file
		w.Header().Set("Content-Length", strconv.FormatInt(fileSize, 10))
		w.WriteHeader(http.StatusOK)
		h.streamFile(w, file, 0, fileSize-1)
		return
	}

	// Parse Range header: "bytes=START-END" or "bytes=START-" or "bytes=-SUFFIX"
	start, end, ok := parseRangeHeader(rangeHeader, fileSize)
	if !ok {
		w.Header().Set("Content-Range", fmt.Sprintf("bytes */%d", fileSize))
		http.Error(w, "Range Not Satisfiable", http.StatusRequestedRangeNotSatisfiable)
		return
	}

	contentLength := end - start + 1
	w.Header().Set("Content-Length", strconv.FormatInt(contentLength, 10))
	w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, fileSize))
	w.WriteHeader(http.StatusPartialContent)

	h.streamFile(w, file, start, end)
}

// streamFile streams a portion of the file from start to end (inclusive)
func (h *VideosHandler) streamFile(w http.ResponseWriter, file *os.File, start, end int64) {
	// Seek to start position
	if _, err := file.Seek(start, io.SeekStart); err != nil {
		log.Printf("Error seeking file: %v", err)
		return
	}

	chunkSize := int64(h.config.StreamChunkSize)
	buffer := make([]byte, chunkSize)
	remaining := end - start + 1

	for remaining > 0 {
		toRead := chunkSize
		if remaining < chunkSize {
			toRead = remaining
		}

		n, err := file.Read(buffer[:toRead])
		if err != nil && err != io.EOF {
			log.Printf("Error reading file: %v", err)
			return
		}
		if n == 0 {
			break
		}

		_, err = w.Write(buffer[:n])
		if err != nil {
			// Client likely disconnected
			return
		}

		remaining -= int64(n)

		// Flush if the ResponseWriter supports it
		if flusher, ok := w.(http.Flusher); ok {
			flusher.Flush()
		}
	}
}

// parseRangeHeader parses an HTTP Range header and returns start, end positions
// Returns (start, end, ok) where ok is false if the range is invalid
func parseRangeHeader(rangeHeader string, fileSize int64) (int64, int64, bool) {
	// Expected format: "bytes=START-END" or "bytes=START-" or "bytes=-SUFFIX"
	if !strings.HasPrefix(rangeHeader, "bytes=") {
		return 0, 0, false
	}

	rangeSpec := strings.TrimPrefix(rangeHeader, "bytes=")
	parts := strings.Split(rangeSpec, "-")
	if len(parts) != 2 {
		return 0, 0, false
	}

	var start, end int64
	var err error

	if parts[0] == "" {
		// Suffix range: bytes=-500 means last 500 bytes
		suffix, err := strconv.ParseInt(parts[1], 10, 64)
		if err != nil || suffix <= 0 {
			return 0, 0, false
		}
		start = fileSize - suffix
		if start < 0 {
			start = 0
		}
		end = fileSize - 1
	} else {
		// Normal range: bytes=0-499 or bytes=500-
		start, err = strconv.ParseInt(parts[0], 10, 64)
		if err != nil || start < 0 || start >= fileSize {
			return 0, 0, false
		}

		if parts[1] == "" {
			// Open-ended range: bytes=500-
			end = fileSize - 1
		} else {
			end, err = strconv.ParseInt(parts[1], 10, 64)
			if err != nil || end < start {
				return 0, 0, false
			}
			// Clamp end to file size
			if end >= fileSize {
				end = fileSize - 1
			}
		}
	}

	return start, end, true
}

// HLS handles GET /api/videos/{short_id}/hls/{filename...}
// Serves HLS manifests with signed segment URLs, returns 410 for segments (nginx should serve those)
func (h *VideosHandler) HLS(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	shortID := r.PathValue("short_id")
	if shortID == "" {
		response.BadRequest(w, "Video ID is required")
		return
	}

	// Get the HLS filename from the path
	// The route is /api/videos/{short_id}/hls/{filename...}
	// We need to extract everything after /hls/
	hlsFilename := r.PathValue("filename")
	if hlsFilename == "" {
		response.BadRequest(w, "HLS filename is required")
		return
	}

	// Get current user for access control
	userID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}
	isAdmin := middleware.IsAdmin(ctx)

	// Get video
	video, err := h.db.Queries.GetVideoByShortID(ctx, shortID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Video not found")
			return
		}
		log.Printf("Error getting video: %v", err)
		response.InternalServerError(w, "Failed to get video")
		return
	}

	// Check access
	if !hasVideoAccess(video, userID, isAdmin) {
		response.Forbidden(w, "You don't have permission to view this video")
		return
	}

	// Handle based on file type
	lowerFilename := strings.ToLower(hlsFilename)

	if strings.HasSuffix(lowerFilename, ".ts") {
		// Segment files should be served by nginx with secure_link validation
		// Return 410 Gone to indicate this endpoint doesn't serve segments
		http.Error(w, "HLS segments should be served by nginx. Configure nginx with secure_link for /hls/ path.", http.StatusGone)
		return
	}

	if !strings.HasSuffix(lowerFilename, ".m3u8") {
		response.BadRequest(w, "Invalid HLS file type. Only .m3u8 manifests are served here.")
		return
	}

	// Read the manifest file
	hlsPath := h.storage.GetHLSFilePath(video.Filename, hlsFilename, video.StoragePath)
	content, err := os.ReadFile(hlsPath)
	if err != nil {
		if os.IsNotExist(err) {
			response.NotFound(w, "HLS manifest not found")
			return
		}
		log.Printf("Error reading HLS manifest: %v", err)
		response.InternalServerError(w, "Failed to read HLS manifest")
		return
	}

	// Rewrite segment URLs to signed nginx URLs
	hlsDir := storage.GetHLSDirectoryName(video.Filename)
	rewrittenContent := h.rewriteHLSManifest(string(content), hlsDir)

	// Send response
	w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
	w.Header().Set("Cache-Control", "public, max-age=3600") // 1 hour cache
	w.Header().Set("Content-Length", strconv.Itoa(len(rewrittenContent)))
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(rewrittenContent))
}

// segmentRegex matches HLS segment filenames like "segment000.ts"
var segmentRegex = regexp.MustCompile(`(segment\d+\.ts)(?!\?)`)

// rewriteHLSManifest rewrites segment URLs in the manifest to signed nginx URLs
func (h *VideosHandler) rewriteHLSManifest(manifest string, hlsDir string) string {
	return segmentRegex.ReplaceAllStringFunc(manifest, func(segment string) string {
		// Build the full path for signing: "hlsDir/segment000.ts"
		segmentPath := fmt.Sprintf("%s/%s", hlsDir, segment)
		// Generate signed URL
		return auth.GenerateSignedHLSURLWithDefaults(segmentPath, h.config.HLSSigningSecret)
	})
}

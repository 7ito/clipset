package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
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
)

// Playlist short ID settings (same as videos)
const playlistShortIDAlphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
const playlistShortIDLength = 10
const maxPlaylistShortIDRetries = 5

// PlaylistsHandler handles playlist management endpoints
type PlaylistsHandler struct {
	db     *db.DB
	config *config.Config
}

// NewPlaylistsHandler creates a new playlists handler
func NewPlaylistsHandler(database *db.DB, cfg *config.Config) *PlaylistsHandler {
	return &PlaylistsHandler{
		db:     database,
		config: cfg,
	}
}

// --- Response Types ---

// PlaylistResponse represents a playlist with metadata
type PlaylistResponse struct {
	ID                  string    `json:"id"`
	ShortID             string    `json:"short_id"`
	Name                string    `json:"name"`
	Description         *string   `json:"description"`
	CreatedBy           string    `json:"created_by"`
	CreatorUsername     string    `json:"creator_username"`
	VideoCount          int64     `json:"video_count"`
	IsPublic            bool      `json:"is_public"`
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
	FirstVideoThumbnail *string   `json:"first_video_thumbnail"`
}

// PlaylistListResponse represents a list of playlists
type PlaylistListResponse struct {
	Playlists []PlaylistResponse `json:"playlists"`
	Total     int64              `json:"total"`
}

// PlaylistVideoDetailResponse represents video info in playlist context
type PlaylistVideoDetailResponse struct {
	ID                string    `json:"id"`
	ShortID           string    `json:"short_id"`
	Title             string    `json:"title"`
	Description       *string   `json:"description"`
	ThumbnailFilename *string   `json:"thumbnail_filename"`
	DurationSeconds   *int32    `json:"duration_seconds"`
	ViewCount         int32     `json:"view_count"`
	ProcessingStatus  string    `json:"processing_status"`
	CreatedAt         time.Time `json:"created_at"`
	UploaderUsername  string    `json:"uploader_username"`
}

// PlaylistVideoResponse represents a video entry in a playlist
type PlaylistVideoResponse struct {
	ID         string                      `json:"id"`
	PlaylistID string                      `json:"playlist_id"`
	VideoID    string                      `json:"video_id"`
	Position   int32                       `json:"position"`
	AddedAt    time.Time                   `json:"added_at"`
	AddedBy    *string                     `json:"added_by"`
	Video      PlaylistVideoDetailResponse `json:"video"`
}

// PlaylistWithVideosResponse represents a playlist with all its videos
type PlaylistWithVideosResponse struct {
	ID                  string                  `json:"id"`
	ShortID             string                  `json:"short_id"`
	Name                string                  `json:"name"`
	Description         *string                 `json:"description"`
	CreatedBy           string                  `json:"created_by"`
	CreatorUsername     string                  `json:"creator_username"`
	VideoCount          int64                   `json:"video_count"`
	IsPublic            bool                    `json:"is_public"`
	CreatedAt           time.Time               `json:"created_at"`
	UpdatedAt           time.Time               `json:"updated_at"`
	FirstVideoThumbnail *string                 `json:"first_video_thumbnail"`
	Videos              []PlaylistVideoResponse `json:"videos"`
}

// --- Request Types ---

// PlaylistCreateRequest represents the create playlist request
type PlaylistCreateRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description"`
}

// PlaylistUpdateRequest represents the update playlist request
type PlaylistUpdateRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
}

// PlaylistVideoAddRequest represents adding a single video
type PlaylistVideoAddRequest struct {
	VideoID  string `json:"video_id"`
	Position *int32 `json:"position"`
}

// PlaylistVideoBatchAddRequest represents adding multiple videos
type PlaylistVideoBatchAddRequest struct {
	VideoIDs []string `json:"video_ids"`
}

// VideoPositionItem represents a video-position pair for reordering
type VideoPositionItem struct {
	VideoID  string `json:"video_id"`
	Position int32  `json:"position"`
}

// PlaylistReorderRequest represents the reorder request
type PlaylistReorderRequest struct {
	VideoPositions []VideoPositionItem `json:"video_positions"`
}

// --- Helper Functions ---

// generateUniquePlaylistShortID generates a unique short ID for playlists
func (h *PlaylistsHandler) generateUniquePlaylistShortID(ctx context.Context) (string, error) {
	for i := 0; i < maxPlaylistShortIDRetries; i++ {
		shortID, err := gonanoid.Generate(playlistShortIDAlphabet, playlistShortIDLength)
		if err != nil {
			return "", fmt.Errorf("failed to generate short ID: %w", err)
		}

		exists, err := h.db.Queries.PlaylistExistsByShortID(ctx, shortID)
		if err != nil {
			return "", fmt.Errorf("failed to check short ID: %w", err)
		}

		if !exists {
			return shortID, nil
		}

		log.Printf("Playlist short ID collision, retrying (%d/%d)", i+1, maxPlaylistShortIDRetries)
	}

	return "", fmt.Errorf("failed to generate unique short ID after %d attempts", maxPlaylistShortIDRetries)
}

// isPlaylistOwner checks if user is the playlist owner
func isPlaylistOwner(playlist sqlc.Playlist, userID uuid.UUID) bool {
	return playlist.CreatedBy == userID
}

// isPlaylistOwnerOrAdmin checks if user is owner or admin
func isPlaylistOwnerOrAdmin(playlist sqlc.Playlist, userID uuid.UUID, isAdmin bool) bool {
	return isAdmin || playlist.CreatedBy == userID
}

// buildPlaylistResponseFromRow converts a ListUserPlaylistsWithThumbnailRow to PlaylistResponse
func buildPlaylistResponseFromUserRow(row sqlc.ListUserPlaylistsWithThumbnailRow) PlaylistResponse {
	return PlaylistResponse{
		ID:                  row.ID.String(),
		ShortID:             row.ShortID,
		Name:                row.Name,
		Description:         row.Description,
		CreatedBy:           row.CreatedBy.String(),
		CreatorUsername:     row.CreatorUsername,
		VideoCount:          row.VideoCount,
		IsPublic:            row.IsPublic,
		CreatedAt:           row.CreatedAt,
		UpdatedAt:           row.UpdatedAt,
		FirstVideoThumbnail: row.FirstVideoThumbnail,
	}
}

// buildPlaylistResponseFromUsernameRow converts a GetPlaylistsByUsernameRow to PlaylistResponse
func buildPlaylistResponseFromUsernameRow(row sqlc.GetPlaylistsByUsernameRow) PlaylistResponse {
	return PlaylistResponse{
		ID:                  row.ID.String(),
		ShortID:             row.ShortID,
		Name:                row.Name,
		Description:         row.Description,
		CreatedBy:           row.CreatedBy.String(),
		CreatorUsername:     row.CreatorUsername,
		VideoCount:          row.VideoCount,
		IsPublic:            row.IsPublic,
		CreatedAt:           row.CreatedAt,
		UpdatedAt:           row.UpdatedAt,
		FirstVideoThumbnail: row.FirstVideoThumbnail,
	}
}

// buildPlaylistVideoResponse converts a GetPlaylistVideosRow to PlaylistVideoResponse
func buildPlaylistVideoResponse(row sqlc.GetPlaylistVideosRow) PlaylistVideoResponse {
	var addedBy *string
	if row.AddedBy.Valid {
		s := uuid.UUID(row.AddedBy.Bytes).String()
		addedBy = &s
	}

	return PlaylistVideoResponse{
		ID:         row.ID.String(),
		PlaylistID: row.PlaylistID.String(),
		VideoID:    row.VideoID.String(),
		Position:   row.Position,
		AddedAt:    row.AddedAt,
		AddedBy:    addedBy,
		Video: PlaylistVideoDetailResponse{
			ID:                row.VideoID.String(),
			ShortID:           row.VideoShortID,
			Title:             row.VideoTitle,
			Description:       row.VideoDescription,
			ThumbnailFilename: row.VideoThumbnail,
			DurationSeconds:   row.VideoDuration,
			ViewCount:         row.VideoViewCount,
			ProcessingStatus:  string(row.VideoStatus),
			CreatedAt:         row.VideoCreatedAt,
			UploaderUsername:  row.VideoUploaderUsername,
		},
	}
}

// --- Handlers ---

// ListByUsername handles GET /api/playlists/by-user/{username}
func (h *PlaylistsHandler) ListByUsername(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	username := r.PathValue("username")
	if username == "" {
		response.BadRequest(w, "Username is required")
		return
	}

	// Verify user is authenticated
	_, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	// Get playlists by username (case-insensitive)
	playlists, err := h.db.Queries.GetPlaylistsByUsername(ctx, strings.ToLower(username))
	if err != nil {
		log.Printf("Error getting playlists by username: %v", err)
		response.InternalServerError(w, "Failed to get playlists")
		return
	}

	// If no playlists found, check if user exists
	if len(playlists) == 0 {
		_, err := h.db.Queries.GetUserByUsername(ctx, strings.ToLower(username))
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				response.NotFound(w, "User not found")
				return
			}
			log.Printf("Error checking user existence: %v", err)
			response.InternalServerError(w, "Failed to get playlists")
			return
		}
	}

	// Build response
	result := make([]PlaylistResponse, len(playlists))
	for i, p := range playlists {
		result[i] = buildPlaylistResponseFromUsernameRow(p)
	}

	response.OK(w, PlaylistListResponse{
		Playlists: result,
		Total:     int64(len(result)),
	})
}

// Create handles POST /api/playlists/
func (h *PlaylistsHandler) Create(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Get current user
	userID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	username, _ := middleware.GetUsername(ctx)

	// Parse request
	var req PlaylistCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "Invalid request body")
		return
	}

	// Validate name
	name := strings.TrimSpace(req.Name)
	if name == "" {
		response.BadRequest(w, "Name is required")
		return
	}
	if len(name) > 200 {
		response.BadRequest(w, "Name must be 200 characters or less")
		return
	}

	// Validate description
	var description *string
	if req.Description != nil {
		desc := strings.TrimSpace(*req.Description)
		if len(desc) > 1000 {
			response.BadRequest(w, "Description must be 1000 characters or less")
			return
		}
		if desc != "" {
			description = &desc
		}
	}

	// Generate short ID
	shortID, err := h.generateUniquePlaylistShortID(ctx)
	if err != nil {
		log.Printf("Error generating playlist short ID: %v", err)
		response.InternalServerError(w, "Failed to create playlist")
		return
	}

	// Create playlist
	playlist, err := h.db.Queries.CreatePlaylist(ctx, sqlc.CreatePlaylistParams{
		ShortID:     shortID,
		Name:        name,
		Description: description,
		CreatedBy:   userID,
		IsPublic:    true, // Default to public
	})
	if err != nil {
		log.Printf("Error creating playlist: %v", err)
		response.InternalServerError(w, "Failed to create playlist")
		return
	}

	log.Printf("Created playlist %s by user %s", playlist.ID, userID)

	response.Created(w, PlaylistResponse{
		ID:                  playlist.ID.String(),
		ShortID:             playlist.ShortID,
		Name:                playlist.Name,
		Description:         playlist.Description,
		CreatedBy:           playlist.CreatedBy.String(),
		CreatorUsername:     username,
		VideoCount:          0,
		IsPublic:            playlist.IsPublic,
		CreatedAt:           playlist.CreatedAt,
		UpdatedAt:           playlist.UpdatedAt,
		FirstVideoThumbnail: nil,
	})
}

// GetByShortID handles GET /api/playlists/{short_id}
func (h *PlaylistsHandler) GetByShortID(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	shortID := r.PathValue("short_id")
	if shortID == "" {
		response.BadRequest(w, "Playlist ID is required")
		return
	}

	// Verify user is authenticated
	_, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	// Get playlist with creator info
	playlist, err := h.db.Queries.GetPlaylistWithVideos(ctx, shortID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Playlist not found")
			return
		}
		log.Printf("Error getting playlist: %v", err)
		response.InternalServerError(w, "Failed to get playlist")
		return
	}

	// Get playlist videos
	videos, err := h.db.Queries.GetPlaylistVideos(ctx, playlist.ID)
	if err != nil {
		log.Printf("Error getting playlist videos: %v", err)
		response.InternalServerError(w, "Failed to get playlist videos")
		return
	}

	// Build video responses
	videoResponses := make([]PlaylistVideoResponse, len(videos))
	for i, v := range videos {
		videoResponses[i] = buildPlaylistVideoResponse(v)
	}

	// Get first video thumbnail (position-based)
	var firstThumbnail *string
	if len(videos) > 0 {
		firstThumbnail = videos[0].VideoThumbnail
	}

	response.OK(w, PlaylistWithVideosResponse{
		ID:                  playlist.ID.String(),
		ShortID:             playlist.ShortID,
		Name:                playlist.Name,
		Description:         playlist.Description,
		CreatedBy:           playlist.CreatedBy.String(),
		CreatorUsername:     playlist.CreatorUsername,
		VideoCount:          int64(len(videos)),
		IsPublic:            playlist.IsPublic,
		CreatedAt:           playlist.CreatedAt,
		UpdatedAt:           playlist.UpdatedAt,
		FirstVideoThumbnail: firstThumbnail,
		Videos:              videoResponses,
	})
}

// Update handles PATCH /api/playlists/{short_id}
func (h *PlaylistsHandler) Update(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	shortID := r.PathValue("short_id")
	if shortID == "" {
		response.BadRequest(w, "Playlist ID is required")
		return
	}

	// Get current user
	userID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	// Get playlist
	playlist, err := h.db.Queries.GetPlaylistByShortID(ctx, shortID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Playlist not found")
			return
		}
		log.Printf("Error getting playlist: %v", err)
		response.InternalServerError(w, "Failed to get playlist")
		return
	}

	// Check ownership (only owner can update, not admin)
	if !isPlaylistOwner(playlist, userID) {
		response.Forbidden(w, "You don't have permission to update this playlist")
		return
	}

	// Parse request
	var req PlaylistUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "Invalid request body")
		return
	}

	// Validate name if provided
	name := ""
	if req.Name != nil {
		name = strings.TrimSpace(*req.Name)
		if name == "" {
			response.BadRequest(w, "Name cannot be empty")
			return
		}
		if len(name) > 200 {
			response.BadRequest(w, "Name must be 200 characters or less")
			return
		}
	}

	// Validate description if provided
	var description *string
	if req.Description != nil {
		desc := strings.TrimSpace(*req.Description)
		if len(desc) > 1000 {
			response.BadRequest(w, "Description must be 1000 characters or less")
			return
		}
		description = &desc
	} else {
		description = playlist.Description
	}

	// Update playlist
	updatedPlaylist, err := h.db.Queries.UpdatePlaylist(ctx, sqlc.UpdatePlaylistParams{
		ID:          playlist.ID,
		Column2:     name, // Empty string keeps existing
		Description: description,
		IsPublic:    playlist.IsPublic, // Keep existing
	})
	if err != nil {
		log.Printf("Error updating playlist: %v", err)
		response.InternalServerError(w, "Failed to update playlist")
		return
	}

	// Get video count and first thumbnail
	videoCount, _ := h.db.Queries.CountPlaylistVideos(ctx, playlist.ID)
	videos, _ := h.db.Queries.GetPlaylistVideos(ctx, playlist.ID)
	var firstThumbnail *string
	if len(videos) > 0 {
		firstThumbnail = videos[0].VideoThumbnail
	}

	// Get creator username
	creator, _ := h.db.Queries.GetUserByID(ctx, playlist.CreatedBy)

	response.OK(w, PlaylistResponse{
		ID:                  updatedPlaylist.ID.String(),
		ShortID:             updatedPlaylist.ShortID,
		Name:                updatedPlaylist.Name,
		Description:         updatedPlaylist.Description,
		CreatedBy:           updatedPlaylist.CreatedBy.String(),
		CreatorUsername:     creator.Username,
		VideoCount:          videoCount,
		IsPublic:            updatedPlaylist.IsPublic,
		CreatedAt:           updatedPlaylist.CreatedAt,
		UpdatedAt:           updatedPlaylist.UpdatedAt,
		FirstVideoThumbnail: firstThumbnail,
	})
}

// Delete handles DELETE /api/playlists/{short_id}
func (h *PlaylistsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	shortID := r.PathValue("short_id")
	if shortID == "" {
		response.BadRequest(w, "Playlist ID is required")
		return
	}

	// Get current user
	userID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}
	isAdmin := middleware.IsAdmin(ctx)

	// Get playlist
	playlist, err := h.db.Queries.GetPlaylistByShortID(ctx, shortID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Playlist not found")
			return
		}
		log.Printf("Error getting playlist: %v", err)
		response.InternalServerError(w, "Failed to get playlist")
		return
	}

	// Check permission (owner or admin)
	if !isPlaylistOwnerOrAdmin(playlist, userID, isAdmin) {
		response.Forbidden(w, "You don't have permission to delete this playlist")
		return
	}

	// Delete playlist (cascade deletes playlist_videos)
	if err := h.db.Queries.DeletePlaylist(ctx, playlist.ID); err != nil {
		log.Printf("Error deleting playlist: %v", err)
		response.InternalServerError(w, "Failed to delete playlist")
		return
	}

	log.Printf("Deleted playlist %s by user %s", playlist.ID, userID)

	response.NoContent(w)
}

// AddVideosBatch handles POST /api/playlists/{short_id}/videos/batch
func (h *PlaylistsHandler) AddVideosBatch(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	shortID := r.PathValue("short_id")
	if shortID == "" {
		response.BadRequest(w, "Playlist ID is required")
		return
	}

	// Get current user
	userID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	// Get playlist
	playlist, err := h.db.Queries.GetPlaylistByShortID(ctx, shortID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Playlist not found")
			return
		}
		log.Printf("Error getting playlist: %v", err)
		response.InternalServerError(w, "Failed to get playlist")
		return
	}

	// Check ownership
	if !isPlaylistOwner(playlist, userID) {
		response.Forbidden(w, "You don't have permission to modify this playlist")
		return
	}

	// Parse request
	var req PlaylistVideoBatchAddRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "Invalid request body")
		return
	}

	if len(req.VideoIDs) == 0 {
		response.BadRequest(w, "At least one video ID is required")
		return
	}

	// Get current max position
	maxPos, err := h.db.Queries.GetMaxPlaylistPosition(ctx, playlist.ID)
	if err != nil {
		log.Printf("Error getting max position: %v", err)
		response.InternalServerError(w, "Failed to add videos")
		return
	}
	nextPosition := maxPos + 1

	// Add videos
	var addedVideos []PlaylistVideoResponse
	for _, videoIDStr := range req.VideoIDs {
		videoID, err := uuid.Parse(videoIDStr)
		if err != nil {
			response.BadRequest(w, fmt.Sprintf("Invalid video ID format: %s", videoIDStr))
			return
		}

		// Check video exists
		video, err := h.db.Queries.GetVideoByID(ctx, videoID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				response.NotFound(w, fmt.Sprintf("Video not found: %s", videoIDStr))
				return
			}
			log.Printf("Error checking video: %v", err)
			response.InternalServerError(w, "Failed to add videos")
			return
		}

		// Check if already in playlist
		exists, err := h.db.Queries.VideoInPlaylist(ctx, sqlc.VideoInPlaylistParams{
			PlaylistID: playlist.ID,
			VideoID:    videoID,
		})
		if err != nil {
			log.Printf("Error checking video in playlist: %v", err)
			response.InternalServerError(w, "Failed to add videos")
			return
		}

		if exists {
			// Skip videos already in playlist (silent skip like Python)
			continue
		}

		// Add video
		pv, err := h.db.Queries.AddVideoToPlaylist(ctx, sqlc.AddVideoToPlaylistParams{
			PlaylistID: playlist.ID,
			VideoID:    videoID,
			Position:   nextPosition,
			AddedBy:    pgtype.UUID{Bytes: userID, Valid: true},
		})
		if err != nil {
			log.Printf("Error adding video to playlist: %v", err)
			response.InternalServerError(w, "Failed to add videos")
			return
		}

		// Get video details for response
		videoWithUploader, err := h.db.Queries.GetVideoByShortIDWithUploader(ctx, video.ShortID)
		if err != nil {
			log.Printf("Warning: couldn't get video details: %v", err)
			continue
		}

		addedByStr := userID.String()
		addedVideos = append(addedVideos, PlaylistVideoResponse{
			ID:         pv.ID.String(),
			PlaylistID: pv.PlaylistID.String(),
			VideoID:    pv.VideoID.String(),
			Position:   pv.Position,
			AddedAt:    pv.AddedAt,
			AddedBy:    &addedByStr,
			Video: PlaylistVideoDetailResponse{
				ID:                videoWithUploader.ID.String(),
				ShortID:           videoWithUploader.ShortID,
				Title:             videoWithUploader.Title,
				Description:       videoWithUploader.Description,
				ThumbnailFilename: videoWithUploader.ThumbnailFilename,
				DurationSeconds:   videoWithUploader.DurationSeconds,
				ViewCount:         videoWithUploader.ViewCount,
				ProcessingStatus:  string(videoWithUploader.ProcessingStatus),
				CreatedAt:         videoWithUploader.CreatedAt,
				UploaderUsername:  videoWithUploader.UploaderUsername,
			},
		})

		nextPosition++
	}

	response.OK(w, addedVideos)
}

// AddVideo handles POST /api/playlists/{short_id}/videos
func (h *PlaylistsHandler) AddVideo(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	shortID := r.PathValue("short_id")
	if shortID == "" {
		response.BadRequest(w, "Playlist ID is required")
		return
	}

	// Get current user
	userID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	// Get playlist
	playlist, err := h.db.Queries.GetPlaylistByShortID(ctx, shortID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Playlist not found")
			return
		}
		log.Printf("Error getting playlist: %v", err)
		response.InternalServerError(w, "Failed to get playlist")
		return
	}

	// Check ownership
	if !isPlaylistOwner(playlist, userID) {
		response.Forbidden(w, "You don't have permission to modify this playlist")
		return
	}

	// Parse request
	var req PlaylistVideoAddRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "Invalid request body")
		return
	}

	if req.VideoID == "" {
		response.BadRequest(w, "Video ID is required")
		return
	}

	videoID, err := uuid.Parse(req.VideoID)
	if err != nil {
		response.BadRequest(w, "Invalid video ID format")
		return
	}

	// Check video exists
	video, err := h.db.Queries.GetVideoByID(ctx, videoID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Video not found")
			return
		}
		log.Printf("Error checking video: %v", err)
		response.InternalServerError(w, "Failed to add video")
		return
	}

	// Check if already in playlist
	exists, err := h.db.Queries.VideoInPlaylist(ctx, sqlc.VideoInPlaylistParams{
		PlaylistID: playlist.ID,
		VideoID:    videoID,
	})
	if err != nil {
		log.Printf("Error checking video in playlist: %v", err)
		response.InternalServerError(w, "Failed to add video")
		return
	}

	if exists {
		response.BadRequest(w, "Video already in playlist")
		return
	}

	// Determine position
	var position int32
	if req.Position != nil {
		position = *req.Position
	} else {
		// Append to end
		maxPos, err := h.db.Queries.GetMaxPlaylistPosition(ctx, playlist.ID)
		if err != nil {
			log.Printf("Error getting max position: %v", err)
			response.InternalServerError(w, "Failed to add video")
			return
		}
		position = maxPos + 1
	}

	// Add video
	pv, err := h.db.Queries.AddVideoToPlaylist(ctx, sqlc.AddVideoToPlaylistParams{
		PlaylistID: playlist.ID,
		VideoID:    videoID,
		Position:   position,
		AddedBy:    pgtype.UUID{Bytes: userID, Valid: true},
	})
	if err != nil {
		log.Printf("Error adding video to playlist: %v", err)
		response.InternalServerError(w, "Failed to add video")
		return
	}

	// Get video details for response
	videoWithUploader, err := h.db.Queries.GetVideoByShortIDWithUploader(ctx, video.ShortID)
	if err != nil {
		log.Printf("Warning: couldn't get video details: %v", err)
		response.InternalServerError(w, "Failed to get video details")
		return
	}

	addedByStr := userID.String()
	response.OK(w, PlaylistVideoResponse{
		ID:         pv.ID.String(),
		PlaylistID: pv.PlaylistID.String(),
		VideoID:    pv.VideoID.String(),
		Position:   pv.Position,
		AddedAt:    pv.AddedAt,
		AddedBy:    &addedByStr,
		Video: PlaylistVideoDetailResponse{
			ID:                videoWithUploader.ID.String(),
			ShortID:           videoWithUploader.ShortID,
			Title:             videoWithUploader.Title,
			Description:       videoWithUploader.Description,
			ThumbnailFilename: videoWithUploader.ThumbnailFilename,
			DurationSeconds:   videoWithUploader.DurationSeconds,
			ViewCount:         videoWithUploader.ViewCount,
			ProcessingStatus:  string(videoWithUploader.ProcessingStatus),
			CreatedAt:         videoWithUploader.CreatedAt,
			UploaderUsername:  videoWithUploader.UploaderUsername,
		},
	})
}

// RemoveVideo handles DELETE /api/playlists/{short_id}/videos/{video_id}
func (h *PlaylistsHandler) RemoveVideo(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	shortID := r.PathValue("short_id")
	if shortID == "" {
		response.BadRequest(w, "Playlist ID is required")
		return
	}

	videoIDStr := r.PathValue("video_id")
	if videoIDStr == "" {
		response.BadRequest(w, "Video ID is required")
		return
	}

	videoID, err := uuid.Parse(videoIDStr)
	if err != nil {
		response.BadRequest(w, "Invalid video ID format")
		return
	}

	// Get current user
	userID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	// Get playlist
	playlist, err := h.db.Queries.GetPlaylistByShortID(ctx, shortID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Playlist not found")
			return
		}
		log.Printf("Error getting playlist: %v", err)
		response.InternalServerError(w, "Failed to get playlist")
		return
	}

	// Check ownership
	if !isPlaylistOwner(playlist, userID) {
		response.Forbidden(w, "You don't have permission to modify this playlist")
		return
	}

	// Get the video entry to find its position
	entry, err := h.db.Queries.GetPlaylistVideoEntry(ctx, sqlc.GetPlaylistVideoEntryParams{
		PlaylistID: playlist.ID,
		VideoID:    videoID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Video not in playlist")
			return
		}
		log.Printf("Error getting playlist entry: %v", err)
		response.InternalServerError(w, "Failed to remove video")
		return
	}

	// Remove video
	if err := h.db.Queries.RemoveVideoFromPlaylist(ctx, sqlc.RemoveVideoFromPlaylistParams{
		PlaylistID: playlist.ID,
		VideoID:    videoID,
	}); err != nil {
		log.Printf("Error removing video from playlist: %v", err)
		response.InternalServerError(w, "Failed to remove video")
		return
	}

	// Auto-compact: decrement positions of videos after the removed one
	if err := h.db.Queries.DecrementPlaylistPositions(ctx, sqlc.DecrementPlaylistPositionsParams{
		PlaylistID: playlist.ID,
		Position:   entry.Position,
	}); err != nil {
		log.Printf("Warning: failed to compact positions: %v", err)
		// Don't fail the request, the video was removed
	}

	response.NoContent(w)
}

// Reorder handles PATCH /api/playlists/{short_id}/reorder
func (h *PlaylistsHandler) Reorder(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	shortID := r.PathValue("short_id")
	if shortID == "" {
		response.BadRequest(w, "Playlist ID is required")
		return
	}

	// Get current user
	userID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	// Get playlist
	playlist, err := h.db.Queries.GetPlaylistByShortID(ctx, shortID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Playlist not found")
			return
		}
		log.Printf("Error getting playlist: %v", err)
		response.InternalServerError(w, "Failed to get playlist")
		return
	}

	// Check ownership
	if !isPlaylistOwner(playlist, userID) {
		response.Forbidden(w, "You don't have permission to modify this playlist")
		return
	}

	// Parse request
	var req PlaylistReorderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "Invalid request body")
		return
	}

	if len(req.VideoPositions) == 0 {
		response.BadRequest(w, "video_positions is required")
		return
	}

	// Validate: check for missing fields and negative positions
	seenPositions := make(map[int32]bool)
	for i, vp := range req.VideoPositions {
		if vp.VideoID == "" {
			response.BadRequest(w, fmt.Sprintf("video_positions[%d]: video_id is required", i))
			return
		}
		if vp.Position < 0 {
			response.BadRequest(w, fmt.Sprintf("video_positions[%d]: position must be >= 0", i))
			return
		}
		// Check for duplicate positions
		if seenPositions[vp.Position] {
			response.BadRequest(w, fmt.Sprintf("Duplicate position %d in reorder request", vp.Position))
			return
		}
		seenPositions[vp.Position] = true
	}

	// Validate all videos exist in playlist and update positions
	for _, vp := range req.VideoPositions {
		videoID, err := uuid.Parse(vp.VideoID)
		if err != nil {
			response.BadRequest(w, fmt.Sprintf("Invalid video ID format: %s", vp.VideoID))
			return
		}

		// Check video is in playlist
		exists, err := h.db.Queries.VideoInPlaylist(ctx, sqlc.VideoInPlaylistParams{
			PlaylistID: playlist.ID,
			VideoID:    videoID,
		})
		if err != nil {
			log.Printf("Error checking video in playlist: %v", err)
			response.InternalServerError(w, "Failed to reorder playlist")
			return
		}
		if !exists {
			response.NotFound(w, fmt.Sprintf("Video %s not found in playlist", vp.VideoID))
			return
		}

		// Update position
		if err := h.db.Queries.UpdatePlaylistVideoPosition(ctx, sqlc.UpdatePlaylistVideoPositionParams{
			PlaylistID: playlist.ID,
			VideoID:    videoID,
			Position:   vp.Position,
		}); err != nil {
			log.Printf("Error updating video position: %v", err)
			response.InternalServerError(w, "Failed to reorder playlist")
			return
		}
	}

	response.OK(w, map[string]string{"message": "Playlist reordered successfully"})
}

// GetUserPlaylists handles GET /api/playlists/videos/{video_id}/playlists
// Returns the current user's playlists (for "Add to Playlist" dialog)
func (h *PlaylistsHandler) GetUserPlaylists(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// The video_id is in the URL but we return the current user's playlists
	// The frontend uses this to show checkboxes for which playlists contain the video
	_ = r.PathValue("video_id") // Acknowledge but don't use

	// Get current user
	userID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	// Get user's playlists
	playlists, err := h.db.Queries.ListUserPlaylistsWithThumbnail(ctx, userID)
	if err != nil {
		log.Printf("Error getting user playlists: %v", err)
		response.InternalServerError(w, "Failed to get playlists")
		return
	}

	// Build response
	result := make([]PlaylistResponse, len(playlists))
	for i, p := range playlists {
		result[i] = buildPlaylistResponseFromUserRow(p)
	}

	response.OK(w, PlaylistListResponse{
		Playlists: result,
		Total:     int64(len(result)),
	})
}

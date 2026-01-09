package handlers

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/clipset/clipset-go/internal/api/middleware"
	"github.com/clipset/clipset-go/internal/api/response"
	"github.com/clipset/clipset-go/internal/config"
	"github.com/clipset/clipset-go/internal/db"
	"github.com/clipset/clipset-go/internal/db/sqlc"
	"github.com/clipset/clipset-go/internal/services/auth"
	"github.com/clipset/clipset-go/internal/services/image"
)

// UsersHandler handles user management endpoints
type UsersHandler struct {
	db             *db.DB
	config         *config.Config
	imageProcessor *image.Processor
}

// NewUsersHandler creates a new users handler
func NewUsersHandler(database *db.DB, cfg *config.Config, imgProcessor *image.Processor) *UsersHandler {
	return &UsersHandler{
		db:             database,
		config:         cfg,
		imageProcessor: imgProcessor,
	}
}

// Response types matching Python schemas for frontend compatibility

// UserResponse - full user info (admin list, own profile without quota)
type UserListResponse struct {
	ID            string    `json:"id"`
	Email         string    `json:"email"`
	Username      string    `json:"username"`
	Role          string    `json:"role"`
	CreatedAt     time.Time `json:"created_at"`
	IsActive      bool      `json:"is_active"`
	AvatarURL     *string   `json:"avatar_url"`
	VideoCount    int64     `json:"video_count"`
	PlaylistCount int64     `json:"playlist_count"`
}

// UserWithQuotaResponse - includes quota info (own profile only)
type UserWithQuotaResponse struct {
	ID                string    `json:"id"`
	Email             string    `json:"email"`
	Username          string    `json:"username"`
	Role              string    `json:"role"`
	CreatedAt         time.Time `json:"created_at"`
	IsActive          bool      `json:"is_active"`
	AvatarURL         *string   `json:"avatar_url"`
	VideoCount        int64     `json:"video_count"`
	PlaylistCount     int64     `json:"playlist_count"`
	WeeklyUploadBytes int64     `json:"weekly_upload_bytes"`
	LastUploadReset   time.Time `json:"last_upload_reset"`
}

// UserProfileResponse - public info only (viewing other users)
type UserProfileResponse struct {
	ID            string    `json:"id"`
	Username      string    `json:"username"`
	CreatedAt     time.Time `json:"created_at"`
	AvatarURL     *string   `json:"avatar_url"`
	VideoCount    int64     `json:"video_count"`
	PlaylistCount int64     `json:"playlist_count"`
}

// UserDirectoryResponse - minimal for grid view
type UserDirectoryResponse struct {
	ID            string  `json:"id"`
	Username      string  `json:"username"`
	AvatarURL     *string `json:"avatar_url"`
	VideoCount    int64   `json:"video_count"`
	PlaylistCount int64   `json:"playlist_count"`
}

// PasswordResetLinkResponse - admin-generated password reset link
type PasswordResetLinkResponse struct {
	ResetLink string `json:"reset_link"`
	ExpiresAt string `json:"expires_at"`
}

// Helper to build avatar URL
func buildAvatarURL(filename *string) *string {
	if filename == nil || *filename == "" {
		return nil
	}
	url := "/media/avatars/" + *filename
	return &url
}

// List handles GET /api/users/ (admin only, paginated)
func (h *UsersHandler) List(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters
	skip := 0
	limit := 10

	if s := r.URL.Query().Get("skip"); s != "" {
		if val, err := strconv.Atoi(s); err == nil && val >= 0 {
			skip = val
		}
	}

	if l := r.URL.Query().Get("limit"); l != "" {
		if val, err := strconv.Atoi(l); err == nil && val >= 1 && val <= 500 {
			limit = val
		}
	}

	// Get users with counts
	users, err := h.db.Queries.ListUsersWithCounts(r.Context(), sqlc.ListUsersWithCountsParams{
		Limit:  int32(limit),
		Offset: int32(skip),
	})
	if err != nil {
		log.Printf("Error listing users: %v", err)
		response.InternalServerError(w, "Failed to list users")
		return
	}

	// Build response
	result := make([]UserListResponse, len(users))
	for i, u := range users {
		result[i] = UserListResponse{
			ID:            u.ID.String(),
			Email:         u.Email,
			Username:      u.Username,
			Role:          string(u.Role),
			CreatedAt:     u.CreatedAt,
			IsActive:      u.IsActive,
			AvatarURL:     buildAvatarURL(u.AvatarFilename),
			VideoCount:    u.VideoCount,
			PlaylistCount: u.PlaylistCount,
		}
	}

	response.OK(w, result)
}

// Directory handles GET /api/users/directory (public user directory)
func (h *UsersHandler) Directory(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters
	search := r.URL.Query().Get("search")
	sort := r.URL.Query().Get("sort")
	if sort == "" {
		sort = "newest"
	}

	// Validate sort option
	validSorts := map[string]bool{
		"newest":       true,
		"alphabetical": true,
		"videos":       true,
		"playlists":    true,
	}
	if !validSorts[sort] {
		sort = "newest"
	}

	// Get users from directory
	users, err := h.db.Queries.ListUsersDirectory(r.Context(), sqlc.ListUsersDirectoryParams{
		Column1: search,
		Column2: sort,
	})
	if err != nil {
		log.Printf("Error listing user directory: %v", err)
		response.InternalServerError(w, "Failed to list user directory")
		return
	}

	// Build response
	result := make([]UserDirectoryResponse, len(users))
	for i, u := range users {
		result[i] = UserDirectoryResponse{
			ID:            u.ID.String(),
			Username:      u.Username,
			AvatarURL:     buildAvatarURL(u.AvatarFilename),
			VideoCount:    u.VideoCount,
			PlaylistCount: u.PlaylistCount,
		}
	}

	response.OK(w, result)
}

// GetByUsername handles GET /api/users/by-username/{username}
func (h *UsersHandler) GetByUsername(w http.ResponseWriter, r *http.Request) {
	username := r.PathValue("username")
	if username == "" {
		response.BadRequest(w, "Username is required")
		return
	}

	// Get current user ID
	currentUserID, _ := middleware.GetUserID(r.Context())

	// Get user with counts
	user, err := h.db.Queries.GetUserByUsernameWithCounts(r.Context(), strings.ToLower(username))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "User not found")
			return
		}
		log.Printf("Error getting user by username: %v", err)
		response.InternalServerError(w, "Failed to get user")
		return
	}

	// Return appropriate response type based on whether viewing own profile
	if user.ID == currentUserID {
		response.OK(w, UserWithQuotaResponse{
			ID:                user.ID.String(),
			Email:             user.Email,
			Username:          user.Username,
			Role:              string(user.Role),
			CreatedAt:         user.CreatedAt,
			IsActive:          user.IsActive,
			AvatarURL:         buildAvatarURL(user.AvatarFilename),
			VideoCount:        user.VideoCount,
			PlaylistCount:     user.PlaylistCount,
			WeeklyUploadBytes: user.WeeklyUploadBytes,
			LastUploadReset:   user.LastUploadReset,
		})
		return
	}

	// Public profile for other users
	response.OK(w, UserProfileResponse{
		ID:            user.ID.String(),
		Username:      user.Username,
		CreatedAt:     user.CreatedAt,
		AvatarURL:     buildAvatarURL(user.AvatarFilename),
		VideoCount:    user.VideoCount,
		PlaylistCount: user.PlaylistCount,
	})
}

// GetByID handles GET /api/users/{user_id}
func (h *UsersHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.PathValue("user_id")
	if userIDStr == "" {
		response.BadRequest(w, "User ID is required")
		return
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		response.BadRequest(w, "Invalid user ID format")
		return
	}

	// Get current user ID
	currentUserID, _ := middleware.GetUserID(r.Context())

	// Get user with counts
	user, err := h.db.Queries.GetUserWithCounts(r.Context(), userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "User not found")
			return
		}
		log.Printf("Error getting user by ID: %v", err)
		response.InternalServerError(w, "Failed to get user")
		return
	}

	// Return appropriate response type based on whether viewing own profile
	if user.ID == currentUserID {
		response.OK(w, UserWithQuotaResponse{
			ID:                user.ID.String(),
			Email:             user.Email,
			Username:          user.Username,
			Role:              string(user.Role),
			CreatedAt:         user.CreatedAt,
			IsActive:          user.IsActive,
			AvatarURL:         buildAvatarURL(user.AvatarFilename),
			VideoCount:        user.VideoCount,
			PlaylistCount:     user.PlaylistCount,
			WeeklyUploadBytes: user.WeeklyUploadBytes,
			LastUploadReset:   user.LastUploadReset,
		})
		return
	}

	// Public profile for other users
	response.OK(w, UserProfileResponse{
		ID:            user.ID.String(),
		Username:      user.Username,
		CreatedAt:     user.CreatedAt,
		AvatarURL:     buildAvatarURL(user.AvatarFilename),
		VideoCount:    user.VideoCount,
		PlaylistCount: user.PlaylistCount,
	})
}

// UploadAvatar handles POST /api/users/me/avatar
func (h *UsersHandler) UploadAvatar(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	// Parse multipart form (max 10MB)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		response.BadRequest(w, "Failed to parse form data")
		return
	}

	// Get file from form
	file, header, err := r.FormFile("file")
	if err != nil {
		response.BadRequest(w, "No file provided")
		return
	}
	defer file.Close()

	// Validate content type
	contentType := header.Header.Get("Content-Type")
	if !strings.HasPrefix(contentType, "image/") {
		response.BadRequest(w, "File must be an image")
		return
	}

	// Get current user to check for existing avatar
	currentUser, err := h.db.Queries.GetUserByID(r.Context(), userID)
	if err != nil {
		log.Printf("Error getting user: %v", err)
		response.InternalServerError(w, "Failed to get user")
		return
	}

	// Save uploaded file to temp
	tempPath, err := h.imageProcessor.SaveUploadToTemp(file, header.Filename)
	if err != nil {
		log.Printf("Error saving temp file: %v", err)
		response.InternalServerError(w, "Failed to save uploaded file")
		return
	}
	defer h.imageProcessor.DeleteFile(tempPath) // Clean up temp file

	// Validate image
	if err := h.imageProcessor.ValidateAvatarImage(tempPath); err != nil {
		response.BadRequest(w, err.Error())
		return
	}

	// Process avatar
	filename, err := h.imageProcessor.ProcessAvatar(tempPath, userID.String())
	if err != nil {
		log.Printf("Error processing avatar: %v", err)
		response.InternalServerError(w, "Failed to process avatar")
		return
	}

	// Delete old avatar if exists
	if currentUser.AvatarFilename != nil {
		if err := h.imageProcessor.DeleteAvatar(*currentUser.AvatarFilename); err != nil {
			log.Printf("Warning: failed to delete old avatar: %v", err)
		}
	}

	// Update user record
	updatedUser, err := h.db.Queries.UpdateUserAvatar(r.Context(), sqlc.UpdateUserAvatarParams{
		ID:             userID,
		AvatarFilename: &filename,
	})
	if err != nil {
		log.Printf("Error updating user avatar: %v", err)
		// Try to clean up the new avatar file
		h.imageProcessor.DeleteAvatar(filename)
		response.InternalServerError(w, "Failed to update user avatar")
		return
	}

	// Get counts for response
	videoCount, _ := h.db.Queries.CountUserVideos(r.Context(), userID)
	playlistCount, _ := h.db.Queries.CountUserPlaylists(r.Context(), userID)

	response.OK(w, UserWithQuotaResponse{
		ID:                updatedUser.ID.String(),
		Email:             updatedUser.Email,
		Username:          updatedUser.Username,
		Role:              string(updatedUser.Role),
		CreatedAt:         updatedUser.CreatedAt,
		IsActive:          updatedUser.IsActive,
		AvatarURL:         buildAvatarURL(updatedUser.AvatarFilename),
		VideoCount:        videoCount,
		PlaylistCount:     playlistCount,
		WeeklyUploadBytes: updatedUser.WeeklyUploadBytes,
		LastUploadReset:   updatedUser.LastUploadReset,
	})
}

// DeleteAvatar handles DELETE /api/users/me/avatar
func (h *UsersHandler) DeleteAvatar(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	// Get current user
	currentUser, err := h.db.Queries.GetUserByID(r.Context(), userID)
	if err != nil {
		log.Printf("Error getting user: %v", err)
		response.InternalServerError(w, "Failed to get user")
		return
	}

	// Check if user has an avatar
	if currentUser.AvatarFilename == nil || *currentUser.AvatarFilename == "" {
		response.NotFound(w, "User has no avatar")
		return
	}

	// Delete avatar file
	if err := h.imageProcessor.DeleteAvatar(*currentUser.AvatarFilename); err != nil {
		log.Printf("Warning: failed to delete avatar file: %v", err)
	}

	// Update user record
	updatedUser, err := h.db.Queries.DeleteUserAvatar(r.Context(), userID)
	if err != nil {
		log.Printf("Error deleting user avatar: %v", err)
		response.InternalServerError(w, "Failed to delete user avatar")
		return
	}

	// Get counts for response
	videoCount, _ := h.db.Queries.CountUserVideos(r.Context(), userID)
	playlistCount, _ := h.db.Queries.CountUserPlaylists(r.Context(), userID)

	response.OK(w, UserWithQuotaResponse{
		ID:                updatedUser.ID.String(),
		Email:             updatedUser.Email,
		Username:          updatedUser.Username,
		Role:              string(updatedUser.Role),
		CreatedAt:         updatedUser.CreatedAt,
		IsActive:          updatedUser.IsActive,
		AvatarURL:         nil,
		VideoCount:        videoCount,
		PlaylistCount:     playlistCount,
		WeeklyUploadBytes: updatedUser.WeeklyUploadBytes,
		LastUploadReset:   updatedUser.LastUploadReset,
	})
}

// Deactivate handles DELETE /api/users/{user_id} (soft delete, admin only)
func (h *UsersHandler) Deactivate(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.PathValue("user_id")
	if userIDStr == "" {
		response.BadRequest(w, "User ID is required")
		return
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		response.BadRequest(w, "Invalid user ID format")
		return
	}

	// Get current admin user ID
	currentUserID, _ := middleware.GetUserID(r.Context())

	// Prevent self-deactivation
	if userID == currentUserID {
		response.BadRequest(w, "Cannot delete yourself")
		return
	}

	// Check user exists
	_, err = h.db.Queries.GetUserByID(r.Context(), userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "User not found")
			return
		}
		log.Printf("Error getting user: %v", err)
		response.InternalServerError(w, "Failed to get user")
		return
	}

	// Deactivate user
	if err := h.db.Queries.DeactivateUser(r.Context(), userID); err != nil {
		log.Printf("Error deactivating user: %v", err)
		response.InternalServerError(w, "Failed to deactivate user")
		return
	}

	response.OK(w, map[string]string{
		"message": "User deactivated successfully",
	})
}

// Activate handles POST /api/users/{user_id}/activate (admin only)
func (h *UsersHandler) Activate(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.PathValue("user_id")
	if userIDStr == "" {
		response.BadRequest(w, "User ID is required")
		return
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		response.BadRequest(w, "Invalid user ID format")
		return
	}

	// Check user exists
	_, err = h.db.Queries.GetUserByID(r.Context(), userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "User not found")
			return
		}
		log.Printf("Error getting user: %v", err)
		response.InternalServerError(w, "Failed to get user")
		return
	}

	// Activate user
	if err := h.db.Queries.ActivateUser(r.Context(), userID); err != nil {
		log.Printf("Error activating user: %v", err)
		response.InternalServerError(w, "Failed to activate user")
		return
	}

	response.OK(w, map[string]string{
		"message": "User activated successfully",
	})
}

// GenerateResetLink handles POST /api/users/{user_id}/generate-reset-link (admin only)
func (h *UsersHandler) GenerateResetLink(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.PathValue("user_id")
	if userIDStr == "" {
		response.BadRequest(w, "User ID is required")
		return
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		response.BadRequest(w, "Invalid user ID format")
		return
	}

	ctx := r.Context()

	// Check user exists
	_, err = h.db.Queries.GetUserByID(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "User not found")
			return
		}
		log.Printf("Error getting user: %v", err)
		response.InternalServerError(w, "Failed to get user")
		return
	}

	// Generate reset token
	token, err := auth.GenerateSecureToken(32)
	if err != nil {
		log.Printf("Error generating token: %v", err)
		response.InternalServerError(w, "Failed to generate token")
		return
	}

	// Hash token for storage
	tokenHash := auth.HashToken(token)

	// Delete any existing reset tokens for this user
	if err := h.db.Queries.DeletePasswordResetTokensByUser(ctx, userID); err != nil {
		log.Printf("Error deleting old tokens: %v", err)
		// Continue anyway
	}

	// Create reset token (expires in 24 hours for admin-generated links)
	expiresAt := time.Now().Add(24 * time.Hour)
	_, err = h.db.Queries.CreatePasswordResetToken(ctx, sqlc.CreatePasswordResetTokenParams{
		UserID:    userID,
		TokenHash: tokenHash,
		ExpiresAt: expiresAt,
	})
	if err != nil {
		log.Printf("Error creating reset token: %v", err)
		response.InternalServerError(w, "Failed to create reset token")
		return
	}

	// Build reset link
	resetLink := h.config.FrontendBaseURL + "/reset-password?token=" + token

	response.OK(w, PasswordResetLinkResponse{
		ResetLink: resetLink,
		ExpiresAt: expiresAt.UTC().Format(time.RFC3339),
	})
}

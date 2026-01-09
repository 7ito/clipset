package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/clipset/clipset-go/internal/api/middleware"
	"github.com/clipset/clipset-go/internal/api/response"
	"github.com/clipset/clipset-go/internal/db"
	"github.com/clipset/clipset-go/internal/db/sqlc"
	"github.com/clipset/clipset-go/internal/domain"
	"github.com/clipset/clipset-go/internal/services/auth"
)

// AuthHandler handles authentication endpoints
type AuthHandler struct {
	db         *db.DB
	jwtService *auth.JWTService
}

// NewAuthHandler creates a new auth handler
func NewAuthHandler(database *db.DB, jwtService *auth.JWTService) *AuthHandler {
	return &AuthHandler{
		db:         database,
		jwtService: jwtService,
	}
}

// Request/Response types

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type RegisterRequest struct {
	Email           string `json:"email"`
	Username        string `json:"username"`
	Password        string `json:"password"`
	InvitationToken string `json:"invitation_token"`
}

type TokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
}

type ForgotPasswordRequest struct {
	Email string `json:"email"`
}

type ResetPasswordRequest struct {
	Token    string `json:"token"`
	Password string `json:"password"`
}

type UserResponse struct {
	ID                string     `json:"id"`
	Email             string     `json:"email"`
	Username          string     `json:"username"`
	Role              string     `json:"role"`
	CreatedAt         time.Time  `json:"created_at"`
	IsActive          bool       `json:"is_active"`
	AvatarURL         *string    `json:"avatar_url"`
	WeeklyUploadBytes int64      `json:"weekly_upload_bytes,omitempty"`
	LastUploadReset   *time.Time `json:"last_upload_reset,omitempty"`
	VideoCount        int64      `json:"video_count"`
	PlaylistCount     int64      `json:"playlist_count"`
}

// Login handles POST /api/auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "Invalid request body")
		return
	}

	// Validate input
	if req.Username == "" || req.Password == "" {
		response.BadRequest(w, "Username and password are required")
		return
	}

	// Get user by username (case-insensitive)
	user, err := h.db.Queries.GetUserByUsername(r.Context(), strings.ToLower(req.Username))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.Unauthorized(w, "Invalid username or password")
			return
		}
		log.Printf("Error getting user: %v", err)
		response.InternalServerError(w, "Internal server error")
		return
	}

	// Check if user is active
	if !user.IsActive {
		response.Unauthorized(w, "Account is deactivated")
		return
	}

	// Verify password
	if !auth.CheckPassword(req.Password, user.PasswordHash) {
		response.Unauthorized(w, "Invalid username or password")
		return
	}

	// Generate token
	token, err := h.jwtService.GenerateToken(user.ID, user.Username, user.Role)
	if err != nil {
		log.Printf("Error generating token: %v", err)
		response.InternalServerError(w, "Failed to generate token")
		return
	}

	response.OK(w, TokenResponse{
		AccessToken: token,
		TokenType:   "bearer",
	})
}

// Register handles POST /api/auth/register
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "Invalid request body")
		return
	}

	// Validate input
	if req.Email == "" || req.Username == "" || req.Password == "" {
		response.BadRequest(w, "Email, username, and password are required")
		return
	}

	if req.InvitationToken == "" {
		response.BadRequest(w, "Invitation token is required")
		return
	}

	if len(req.Password) < 8 {
		response.BadRequest(w, "Password must be at least 8 characters")
		return
	}

	if len(req.Username) < 3 || len(req.Username) > 50 {
		response.BadRequest(w, "Username must be between 3 and 50 characters")
		return
	}

	ctx := r.Context()

	// Validate invitation token
	invitation, err := h.db.Queries.GetValidInvitationByToken(ctx, req.InvitationToken)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.BadRequest(w, "Invalid or expired invitation token")
			return
		}
		log.Printf("Error validating invitation: %v", err)
		response.InternalServerError(w, "Internal server error")
		return
	}

	// Check if email already exists
	emailExists, err := h.db.Queries.UserExistsByEmail(ctx, strings.ToLower(req.Email))
	if err != nil {
		log.Printf("Error checking email: %v", err)
		response.InternalServerError(w, "Internal server error")
		return
	}
	if emailExists {
		response.Conflict(w, "Email already registered")
		return
	}

	// Check if username already exists
	usernameExists, err := h.db.Queries.UserExistsByUsername(ctx, strings.ToLower(req.Username))
	if err != nil {
		log.Printf("Error checking username: %v", err)
		response.InternalServerError(w, "Internal server error")
		return
	}
	if usernameExists {
		response.Conflict(w, "Username already taken")
		return
	}

	// Hash password
	passwordHash, err := auth.HashPassword(req.Password)
	if err != nil {
		log.Printf("Error hashing password: %v", err)
		response.InternalServerError(w, "Internal server error")
		return
	}

	// Create user
	user, err := h.db.Queries.CreateUser(ctx, sqlc.CreateUserParams{
		Email:        strings.ToLower(req.Email),
		Username:     strings.ToLower(req.Username),
		PasswordHash: passwordHash,
		Role:         domain.UserRoleUser,
	})
	if err != nil {
		log.Printf("Error creating user: %v", err)
		response.InternalServerError(w, "Failed to create user")
		return
	}

	// Mark invitation as used
	if err := h.db.Queries.MarkInvitationUsed(ctx, invitation.ID); err != nil {
		log.Printf("Error marking invitation used: %v", err)
		// Don't fail the registration, just log the error
	}

	// Generate token
	token, err := h.jwtService.GenerateToken(user.ID, user.Username, user.Role)
	if err != nil {
		log.Printf("Error generating token: %v", err)
		response.InternalServerError(w, "Failed to generate token")
		return
	}

	response.Created(w, h.userToResponse(ctx, &user, true))

	// Also return the token in a header for immediate use
	w.Header().Set("X-Auth-Token", token)
}

// Me handles GET /api/auth/me
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	user, err := h.db.Queries.GetUserByID(r.Context(), userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "User not found")
			return
		}
		log.Printf("Error getting user: %v", err)
		response.InternalServerError(w, "Internal server error")
		return
	}

	response.OK(w, h.userToResponse(r.Context(), &user, true))
}

// ForgotPassword handles POST /api/auth/forgot-password
func (h *AuthHandler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req ForgotPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "Invalid request body")
		return
	}

	if req.Email == "" {
		response.BadRequest(w, "Email is required")
		return
	}

	ctx := r.Context()

	// Get user by email
	user, err := h.db.Queries.GetUserByEmail(ctx, strings.ToLower(req.Email))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Don't reveal if email exists
			response.OK(w, map[string]string{
				"message": "If the email exists, a reset link has been sent",
			})
			return
		}
		log.Printf("Error getting user: %v", err)
		response.InternalServerError(w, "Internal server error")
		return
	}

	// Generate reset token
	token, err := auth.GenerateSecureToken(32)
	if err != nil {
		log.Printf("Error generating token: %v", err)
		response.InternalServerError(w, "Internal server error")
		return
	}

	// Hash token for storage
	tokenHash := auth.HashToken(token)

	// Delete any existing reset tokens for this user
	if err := h.db.Queries.DeletePasswordResetTokensByUser(ctx, user.ID); err != nil {
		log.Printf("Error deleting old tokens: %v", err)
		// Continue anyway
	}

	// Create reset token (expires in 1 hour)
	_, err = h.db.Queries.CreatePasswordResetToken(ctx, sqlc.CreatePasswordResetTokenParams{
		UserID:    user.ID,
		TokenHash: tokenHash,
		ExpiresAt: time.Now().Add(1 * time.Hour),
	})
	if err != nil {
		log.Printf("Error creating reset token: %v", err)
		response.InternalServerError(w, "Internal server error")
		return
	}

	// In production, send email here
	// For now, log the reset link
	log.Printf("Password reset link for %s: /reset-password?token=%s", user.Email, token)

	response.OK(w, map[string]string{
		"message": "If the email exists, a reset link has been sent",
	})
}

// VerifyResetToken handles GET /api/auth/verify-reset-token
func (h *AuthHandler) VerifyResetToken(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		response.BadRequest(w, "Token is required")
		return
	}

	tokenHash := auth.HashToken(token)

	resetToken, err := h.db.Queries.GetValidPasswordResetByHash(r.Context(), tokenHash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.BadRequest(w, "Invalid or expired token")
			return
		}
		log.Printf("Error getting reset token: %v", err)
		response.InternalServerError(w, "Internal server error")
		return
	}

	// Get user
	user, err := h.db.Queries.GetUserByID(r.Context(), resetToken.UserID)
	if err != nil {
		log.Printf("Error getting user: %v", err)
		response.InternalServerError(w, "Internal server error")
		return
	}

	response.OK(w, map[string]string{
		"username": user.Username,
	})
}

// ResetPassword handles POST /api/auth/reset-password
func (h *AuthHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req ResetPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "Invalid request body")
		return
	}

	if req.Token == "" || req.Password == "" {
		response.BadRequest(w, "Token and password are required")
		return
	}

	if len(req.Password) < 8 {
		response.BadRequest(w, "Password must be at least 8 characters")
		return
	}

	ctx := r.Context()
	tokenHash := auth.HashToken(req.Token)

	// Get and validate reset token
	resetToken, err := h.db.Queries.GetValidPasswordResetByHash(ctx, tokenHash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.BadRequest(w, "Invalid or expired token")
			return
		}
		log.Printf("Error getting reset token: %v", err)
		response.InternalServerError(w, "Internal server error")
		return
	}

	// Hash new password
	passwordHash, err := auth.HashPassword(req.Password)
	if err != nil {
		log.Printf("Error hashing password: %v", err)
		response.InternalServerError(w, "Internal server error")
		return
	}

	// Update user password using raw query since we don't have a dedicated update password query
	_, err = h.db.Pool.Exec(ctx,
		"UPDATE users SET password_hash = $1 WHERE id = $2",
		passwordHash, resetToken.UserID)
	if err != nil {
		log.Printf("Error updating password: %v", err)
		response.InternalServerError(w, "Failed to update password")
		return
	}

	// Delete the reset token
	if err := h.db.Queries.DeletePasswordResetToken(ctx, resetToken.ID); err != nil {
		log.Printf("Error deleting reset token: %v", err)
		// Don't fail the request
	}

	response.OK(w, map[string]string{
		"message": "Password has been reset successfully",
	})
}

// Helper to convert user to response
func (h *AuthHandler) userToResponse(ctx context.Context, user *sqlc.User, includeQuota bool) UserResponse {
	resp := UserResponse{
		ID:        user.ID.String(),
		Email:     user.Email,
		Username:  user.Username,
		Role:      string(user.Role),
		CreatedAt: user.CreatedAt,
		IsActive:  user.IsActive,
	}

	// Avatar URL
	if user.AvatarFilename != nil {
		avatarURL := "/api/users/" + user.ID.String() + "/avatar"
		resp.AvatarURL = &avatarURL
	}

	// Get counts
	videoCount, _ := h.db.Queries.CountUserVideos(ctx, user.ID)
	playlistCount, _ := h.db.Queries.CountUserPlaylists(ctx, user.ID)
	resp.VideoCount = videoCount
	resp.PlaylistCount = playlistCount

	// Include quota info for own profile
	if includeQuota {
		resp.WeeklyUploadBytes = user.WeeklyUploadBytes
		resp.LastUploadReset = &user.LastUploadReset
	}

	return resp
}

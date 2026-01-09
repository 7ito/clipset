package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/mail"
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
)

// Invitation settings
const (
	invitationTokenBytes     = 32 // Number of random bytes for token
	invitationExpirationDays = 7  // Days until invitation expires
)

// InvitationsHandler handles invitation management endpoints
type InvitationsHandler struct {
	db     *db.DB
	config *config.Config
}

// NewInvitationsHandler creates a new invitations handler
func NewInvitationsHandler(database *db.DB, cfg *config.Config) *InvitationsHandler {
	return &InvitationsHandler{
		db:     database,
		config: cfg,
	}
}

// --- Response Types ---

// InvitationResponse represents an invitation
type InvitationResponse struct {
	ID        string     `json:"id"`
	Email     string     `json:"email"`
	Token     string     `json:"token"`
	CreatedBy string     `json:"created_by"`
	CreatedAt time.Time  `json:"created_at"`
	ExpiresAt time.Time  `json:"expires_at"`
	Used      bool       `json:"used"`
	UsedAt    *time.Time `json:"used_at"`
}

// InvitationWithLinkResponse includes the invitation link
type InvitationWithLinkResponse struct {
	ID             string     `json:"id"`
	Email          string     `json:"email"`
	Token          string     `json:"token"`
	CreatedBy      string     `json:"created_by"`
	CreatedAt      time.Time  `json:"created_at"`
	ExpiresAt      time.Time  `json:"expires_at"`
	Used           bool       `json:"used"`
	UsedAt         *time.Time `json:"used_at"`
	InvitationLink string     `json:"invitation_link"`
}

// InvitationListResponse represents a list of invitations
type InvitationListResponse struct {
	Invitations []InvitationResponse `json:"invitations"`
	Total       int64                `json:"total"`
}

// InvitationValidationResponse represents the validation result
type InvitationValidationResponse struct {
	Valid   bool    `json:"valid"`
	Email   *string `json:"email"`
	Message string  `json:"message"`
}

// --- Request Types ---

// InvitationCreateRequest represents the create invitation request
type InvitationCreateRequest struct {
	Email string `json:"email"`
}

// --- Helper Functions ---

// generateURLSafeToken generates a cryptographically secure URL-safe token
// This is equivalent to Python's secrets.token_urlsafe(32)
func generateURLSafeToken(length int) (string, error) {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("failed to generate random bytes: %w", err)
	}
	// Use RawURLEncoding to avoid padding characters (=)
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

// isValidEmail validates an email address
func isValidEmail(email string) bool {
	_, err := mail.ParseAddress(email)
	return err == nil
}

// buildInvitationLink constructs the invitation registration link
func (h *InvitationsHandler) buildInvitationLink(token string) string {
	baseURL := strings.TrimSuffix(h.config.FrontendBaseURL, "/")
	return fmt.Sprintf("%s/register/%s", baseURL, token)
}

// buildInvitationResponse converts a database invitation to a response
func buildInvitationResponse(inv sqlc.Invitation) InvitationResponse {
	var usedAt *time.Time
	if inv.UsedAt.Valid {
		usedAt = &inv.UsedAt.Time
	}

	return InvitationResponse{
		ID:        inv.ID.String(),
		Email:     inv.Email,
		Token:     inv.Token,
		CreatedBy: inv.CreatedBy.String(),
		CreatedAt: inv.CreatedAt,
		ExpiresAt: inv.ExpiresAt,
		Used:      inv.Used,
		UsedAt:    usedAt,
	}
}

// buildInvitationResponseFromListRow converts a list row to a response
func buildInvitationResponseFromListRow(row sqlc.ListInvitationsRow) InvitationResponse {
	var usedAt *time.Time
	if row.UsedAt.Valid {
		usedAt = &row.UsedAt.Time
	}

	return InvitationResponse{
		ID:        row.ID.String(),
		Email:     row.Email,
		Token:     row.Token,
		CreatedBy: row.CreatedBy.String(),
		CreatedAt: row.CreatedAt,
		ExpiresAt: row.ExpiresAt,
		Used:      row.Used,
		UsedAt:    usedAt,
	}
}

// --- Handlers ---

// Create handles POST /api/invitations/
func (h *InvitationsHandler) Create(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Get current user (admin check is done by middleware)
	userID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	// Parse request body
	var req InvitationCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "Invalid request body")
		return
	}

	// Validate email
	email := strings.TrimSpace(strings.ToLower(req.Email))
	if email == "" {
		response.BadRequest(w, "Email is required")
		return
	}
	if !isValidEmail(email) {
		response.BadRequest(w, "Invalid email format")
		return
	}

	// Generate token
	token, err := generateURLSafeToken(invitationTokenBytes)
	if err != nil {
		log.Printf("Error generating invitation token: %v", err)
		response.InternalServerError(w, "Failed to create invitation")
		return
	}

	// Calculate expiration (7 days from now)
	expiresAt := time.Now().UTC().Add(time.Duration(invitationExpirationDays) * 24 * time.Hour)

	// Create invitation
	invitation, err := h.db.Queries.CreateInvitation(ctx, sqlc.CreateInvitationParams{
		Lower:     email, // The SQL uses LOWER($1), but we already lowercased it
		Token:     token,
		CreatedBy: userID,
		ExpiresAt: expiresAt,
	})
	if err != nil {
		log.Printf("Error creating invitation: %v", err)
		response.InternalServerError(w, "Failed to create invitation")
		return
	}

	log.Printf("Created invitation %s for email %s by user %s", invitation.ID, email, userID)

	// Build response with invitation link
	invResponse := InvitationWithLinkResponse{
		ID:             invitation.ID.String(),
		Email:          invitation.Email,
		Token:          invitation.Token,
		CreatedBy:      invitation.CreatedBy.String(),
		CreatedAt:      invitation.CreatedAt,
		ExpiresAt:      invitation.ExpiresAt,
		Used:           invitation.Used,
		UsedAt:         nil,
		InvitationLink: h.buildInvitationLink(invitation.Token),
	}

	response.Created(w, invResponse)
}

// List handles GET /api/invitations/
func (h *InvitationsHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Verify user is authenticated (admin check is done by middleware)
	_, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	// Parse pagination parameters
	skip := 0
	limit := 10

	if skipStr := r.URL.Query().Get("skip"); skipStr != "" {
		if s, err := strconv.Atoi(skipStr); err == nil && s >= 0 {
			skip = s
		}
	}

	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l >= 1 && l <= 100 {
			limit = l
		}
	}

	// Get invitations
	invitations, err := h.db.Queries.ListInvitations(ctx, sqlc.ListInvitationsParams{
		Limit:  int32(limit),
		Offset: int32(skip),
	})
	if err != nil {
		log.Printf("Error listing invitations: %v", err)
		response.InternalServerError(w, "Failed to list invitations")
		return
	}

	// Get total count
	total, err := h.db.Queries.CountInvitations(ctx)
	if err != nil {
		log.Printf("Error counting invitations: %v", err)
		response.InternalServerError(w, "Failed to count invitations")
		return
	}

	// Build response
	invResponses := make([]InvitationResponse, len(invitations))
	for i, inv := range invitations {
		invResponses[i] = buildInvitationResponseFromListRow(inv)
	}

	response.OK(w, InvitationListResponse{
		Invitations: invResponses,
		Total:       total,
	})
}

// Validate handles GET /api/invitations/validate/{token}
// This endpoint is PUBLIC - no authentication required
func (h *InvitationsHandler) Validate(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Get token from path
	token := r.PathValue("token")
	if token == "" {
		response.OK(w, InvitationValidationResponse{
			Valid:   false,
			Email:   nil,
			Message: "Token is required",
		})
		return
	}

	// Try to get the invitation by token
	invitation, err := h.db.Queries.GetInvitationByToken(ctx, token)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.OK(w, InvitationValidationResponse{
				Valid:   false,
				Email:   nil,
				Message: "Invitation not found",
			})
			return
		}
		log.Printf("Error getting invitation: %v", err)
		response.InternalServerError(w, "Failed to validate invitation")
		return
	}

	// Check if already used
	if invitation.Used {
		response.OK(w, InvitationValidationResponse{
			Valid:   false,
			Email:   &invitation.Email,
			Message: "Invitation has already been used",
		})
		return
	}

	// Check if expired
	if time.Now().UTC().After(invitation.ExpiresAt) {
		response.OK(w, InvitationValidationResponse{
			Valid:   false,
			Email:   &invitation.Email,
			Message: "Invitation has expired",
		})
		return
	}

	// Valid invitation
	response.OK(w, InvitationValidationResponse{
		Valid:   true,
		Email:   &invitation.Email,
		Message: "Invitation is valid",
	})
}

// Delete handles DELETE /api/invitations/{invitation_id}
func (h *InvitationsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Get current user (admin check is done by middleware)
	userID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	// Get invitation_id from path
	invitationIDStr := r.PathValue("invitation_id")
	if invitationIDStr == "" {
		response.BadRequest(w, "Invitation ID is required")
		return
	}

	invitationID, err := uuid.Parse(invitationIDStr)
	if err != nil {
		response.BadRequest(w, "Invalid invitation ID format")
		return
	}

	// Verify invitation exists
	_, err = h.db.Queries.GetInvitationByID(ctx, invitationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Invitation not found")
			return
		}
		log.Printf("Error getting invitation: %v", err)
		response.InternalServerError(w, "Failed to get invitation")
		return
	}

	// Delete invitation
	if err := h.db.Queries.DeleteInvitation(ctx, invitationID); err != nil {
		log.Printf("Error deleting invitation: %v", err)
		response.InternalServerError(w, "Failed to delete invitation")
		return
	}

	log.Printf("Deleted invitation %s by user %s", invitationID, userID)

	response.OK(w, map[string]string{"message": "Invitation revoked successfully"})
}

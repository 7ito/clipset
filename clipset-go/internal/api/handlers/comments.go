package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/clipset/clipset-go/internal/api/middleware"
	"github.com/clipset/clipset-go/internal/api/response"
	"github.com/clipset/clipset-go/internal/config"
	"github.com/clipset/clipset-go/internal/db"
	"github.com/clipset/clipset-go/internal/db/sqlc"
)

// Comment edit window duration
const commentEditWindowHours = 24

// Comment edit threshold in seconds (edits within this window don't count as "edited")
const commentEditThresholdSeconds = 60

// CommentsHandler handles comment management endpoints
type CommentsHandler struct {
	db     *db.DB
	config *config.Config
}

// NewCommentsHandler creates a new comments handler
func NewCommentsHandler(database *db.DB, cfg *config.Config) *CommentsHandler {
	return &CommentsHandler{
		db:     database,
		config: cfg,
	}
}

// --- Response Types ---

// CommentResponse represents a comment with computed fields
type CommentResponse struct {
	ID               string            `json:"id"`
	VideoID          string            `json:"video_id"`
	Content          string            `json:"content"`
	TimestampSeconds *int32            `json:"timestamp_seconds"`
	ParentID         *string           `json:"parent_id"`
	UserID           string            `json:"user_id"`
	AuthorUsername   string            `json:"author_username"`
	AuthorAvatarURL  *string           `json:"author_avatar_url"`
	CreatedAt        time.Time         `json:"created_at"`
	UpdatedAt        time.Time         `json:"updated_at"`
	IsEdited         bool              `json:"is_edited"`
	CanEdit          bool              `json:"can_edit"`
	CanDelete        bool              `json:"can_delete"`
	ReplyCount       int64             `json:"reply_count"`
	Replies          []CommentResponse `json:"replies"`
}

// CommentListResponse represents a paginated list of comments
type CommentListResponse struct {
	Comments []CommentResponse `json:"comments"`
	Total    int64             `json:"total"`
	HasMore  bool              `json:"has_more"`
}

// CommentMarker represents a timestamp marker for the video timeline
type CommentMarker struct {
	Seconds int32 `json:"seconds"`
	Count   int64 `json:"count"`
}

// --- Request Types ---

// CommentCreateRequest represents the create comment request
type CommentCreateRequest struct {
	Content          string  `json:"content"`
	TimestampSeconds *int32  `json:"timestamp_seconds"`
	ParentID         *string `json:"parent_id"`
}

// CommentUpdateRequest represents the update comment request
type CommentUpdateRequest struct {
	Content string `json:"content"`
}

// --- Helper Functions ---

// Note: buildAvatarURL is defined in users.go (same package)

// isEdited checks if a comment has been edited (updated > 60s after creation)
func isEdited(createdAt, updatedAt time.Time) bool {
	return updatedAt.Sub(createdAt).Seconds() > commentEditThresholdSeconds
}

// canEditComment checks if user can edit the comment (author only, within 24h)
func canEditComment(commentUserID, currentUserID uuid.UUID, createdAt time.Time) bool {
	if commentUserID != currentUserID {
		return false
	}
	return time.Since(createdAt) < time.Duration(commentEditWindowHours)*time.Hour
}

// canDeleteComment checks if user can delete the comment (author, video owner, or admin)
func canDeleteComment(commentUserID, videoOwnerID, currentUserID uuid.UUID, isAdmin bool) bool {
	if isAdmin {
		return true
	}
	if commentUserID == currentUserID {
		return true
	}
	if videoOwnerID == currentUserID {
		return true
	}
	return false
}

// pgUUIDToString converts a pgtype.UUID to *string
func pgUUIDToString(u pgtype.UUID) *string {
	if !u.Valid {
		return nil
	}
	s := uuid.UUID(u.Bytes).String()
	return &s
}

// buildCommentResponseFromListRow builds a CommentResponse from a ListCommentsByVideoRow
func buildCommentResponseFromListRow(
	row sqlc.ListCommentsByVideoRow,
	currentUserID, videoOwnerID uuid.UUID,
	isAdmin bool,
	replies []CommentResponse,
) CommentResponse {
	return CommentResponse{
		ID:               row.ID.String(),
		VideoID:          row.VideoID.String(),
		Content:          row.Content,
		TimestampSeconds: row.TimestampSeconds,
		ParentID:         pgUUIDToString(row.ParentID),
		UserID:           row.UserID.String(),
		AuthorUsername:   row.AuthorUsername,
		AuthorAvatarURL:  buildAvatarURL(row.AuthorAvatar),
		CreatedAt:        row.CreatedAt,
		UpdatedAt:        row.UpdatedAt,
		IsEdited:         isEdited(row.CreatedAt, row.UpdatedAt),
		CanEdit:          canEditComment(row.UserID, currentUserID, row.CreatedAt),
		CanDelete:        canDeleteComment(row.UserID, videoOwnerID, currentUserID, isAdmin),
		ReplyCount:       row.ReplyCount,
		Replies:          replies,
	}
}

// buildCommentResponseFromReplyRow builds a CommentResponse from a ListRepliesByCommentRow
func buildCommentResponseFromReplyRow(
	row sqlc.ListRepliesByCommentRow,
	currentUserID, videoOwnerID uuid.UUID,
	isAdmin bool,
) CommentResponse {
	return CommentResponse{
		ID:               row.ID.String(),
		VideoID:          row.VideoID.String(),
		Content:          row.Content,
		TimestampSeconds: row.TimestampSeconds,
		ParentID:         pgUUIDToString(row.ParentID),
		UserID:           row.UserID.String(),
		AuthorUsername:   row.AuthorUsername,
		AuthorAvatarURL:  buildAvatarURL(row.AuthorAvatar),
		CreatedAt:        row.CreatedAt,
		UpdatedAt:        row.UpdatedAt,
		IsEdited:         isEdited(row.CreatedAt, row.UpdatedAt),
		CanEdit:          canEditComment(row.UserID, currentUserID, row.CreatedAt),
		CanDelete:        canDeleteComment(row.UserID, videoOwnerID, currentUserID, isAdmin),
		ReplyCount:       0,
		Replies:          nil,
	}
}

// buildCommentResponseFromWithAuthorRow builds a CommentResponse from GetCommentWithAuthorRow
func buildCommentResponseFromWithAuthorRow(
	row sqlc.GetCommentWithAuthorRow,
	currentUserID uuid.UUID,
	isAdmin bool,
	replyCount int64,
) CommentResponse {
	return CommentResponse{
		ID:               row.ID.String(),
		VideoID:          row.VideoID.String(),
		Content:          row.Content,
		TimestampSeconds: row.TimestampSeconds,
		ParentID:         pgUUIDToString(row.ParentID),
		UserID:           row.UserID.String(),
		AuthorUsername:   row.AuthorUsername,
		AuthorAvatarURL:  buildAvatarURL(row.AuthorAvatar),
		CreatedAt:        row.CreatedAt,
		UpdatedAt:        row.UpdatedAt,
		IsEdited:         isEdited(row.CreatedAt, row.UpdatedAt),
		CanEdit:          canEditComment(row.UserID, currentUserID, row.CreatedAt),
		CanDelete:        canDeleteComment(row.UserID, row.VideoOwnerID, currentUserID, isAdmin),
		ReplyCount:       replyCount,
		Replies:          nil,
	}
}

// --- Handlers ---

// ListByVideo handles GET /api/videos/{video_id}/comments
func (h *CommentsHandler) ListByVideo(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Parse video_id
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
	currentUserID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}
	isAdmin := middleware.IsAdmin(ctx)

	// Verify video exists and get owner
	video, err := h.db.Queries.GetVideoByID(ctx, videoID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Video not found")
			return
		}
		log.Printf("Error getting video: %v", err)
		response.InternalServerError(w, "Failed to get video")
		return
	}
	videoOwnerID := video.UploadedBy

	// Parse pagination parameters
	skip := 0
	limit := 50
	sort := "newest"

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

	if sortParam := r.URL.Query().Get("sort"); sortParam != "" {
		switch sortParam {
		case "newest", "oldest", "timestamp":
			sort = sortParam
		default:
			response.BadRequest(w, "Invalid sort parameter. Must be 'newest', 'oldest', or 'timestamp'")
			return
		}
	}

	// Get top-level comments
	comments, err := h.db.Queries.ListCommentsByVideo(ctx, sqlc.ListCommentsByVideoParams{
		VideoID: videoID,
		Column2: sort,
		Limit:   int32(limit),
		Offset:  int32(skip),
	})
	if err != nil {
		log.Printf("Error listing comments: %v", err)
		response.InternalServerError(w, "Failed to get comments")
		return
	}

	// Get total count
	total, err := h.db.Queries.CountCommentsByVideo(ctx, videoID)
	if err != nil {
		log.Printf("Error counting comments: %v", err)
		response.InternalServerError(w, "Failed to count comments")
		return
	}

	// Fetch all replies for all top-level comments eagerly
	// Build a map of parent_id -> replies
	repliesMap := make(map[uuid.UUID][]CommentResponse)

	for _, comment := range comments {
		replies, err := h.db.Queries.ListRepliesByComment(ctx, pgtype.UUID{
			Bytes: comment.ID,
			Valid: true,
		})
		if err != nil {
			log.Printf("Error fetching replies for comment %s: %v", comment.ID, err)
			continue
		}

		replyResponses := make([]CommentResponse, len(replies))
		for i, reply := range replies {
			replyResponses[i] = buildCommentResponseFromReplyRow(reply, currentUserID, videoOwnerID, isAdmin)
		}
		repliesMap[comment.ID] = replyResponses
	}

	// Build response
	commentResponses := make([]CommentResponse, len(comments))
	for i, comment := range comments {
		replies := repliesMap[comment.ID]
		if replies == nil {
			replies = []CommentResponse{}
		}
		commentResponses[i] = buildCommentResponseFromListRow(comment, currentUserID, videoOwnerID, isAdmin, replies)
	}

	hasMore := total > int64(skip+limit)

	response.OK(w, CommentListResponse{
		Comments: commentResponses,
		Total:    total,
		HasMore:  hasMore,
	})
}

// Create handles POST /api/videos/{video_id}/comments
func (h *CommentsHandler) Create(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Parse video_id
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
	currentUserID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}
	currentUsername, _ := middleware.GetUsername(ctx)
	isAdmin := middleware.IsAdmin(ctx)

	// Verify video exists and get owner
	video, err := h.db.Queries.GetVideoByID(ctx, videoID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Video not found")
			return
		}
		log.Printf("Error getting video: %v", err)
		response.InternalServerError(w, "Failed to get video")
		return
	}
	videoOwnerID := video.UploadedBy

	// Parse request body
	var req CommentCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "Invalid request body")
		return
	}

	// Validate content
	content := strings.TrimSpace(req.Content)
	if content == "" {
		response.BadRequest(w, "Content is required")
		return
	}
	if len(content) > 2000 {
		response.BadRequest(w, "Content must be 2000 characters or less")
		return
	}

	// Validate timestamp_seconds
	if req.TimestampSeconds != nil && *req.TimestampSeconds < 0 {
		response.BadRequest(w, "Timestamp must be >= 0")
		return
	}

	// Handle parent_id for replies
	var parentID pgtype.UUID
	if req.ParentID != nil && *req.ParentID != "" {
		parsedParentID, err := uuid.Parse(*req.ParentID)
		if err != nil {
			response.BadRequest(w, "Invalid parent ID format")
			return
		}

		// Fetch parent comment
		parentComment, err := h.db.Queries.GetCommentByID(ctx, parsedParentID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				response.NotFound(w, "Parent comment not found")
				return
			}
			log.Printf("Error getting parent comment: %v", err)
			response.InternalServerError(w, "Failed to validate parent comment")
			return
		}

		// Verify parent belongs to same video
		if parentComment.VideoID != videoID {
			response.BadRequest(w, "Parent comment belongs to a different video")
			return
		}

		// Verify parent is not a reply (single-level nesting only)
		if parentComment.ParentID.Valid {
			response.BadRequest(w, "Nested replies are not supported")
			return
		}

		parentID = pgtype.UUID{Bytes: parsedParentID, Valid: true}
	}

	// Create comment
	comment, err := h.db.Queries.CreateComment(ctx, sqlc.CreateCommentParams{
		VideoID:          videoID,
		UserID:           currentUserID,
		Content:          content,
		TimestampSeconds: req.TimestampSeconds,
		ParentID:         parentID,
	})
	if err != nil {
		log.Printf("Error creating comment: %v", err)
		response.InternalServerError(w, "Failed to create comment")
		return
	}

	// Get user avatar for response
	user, err := h.db.Queries.GetUserByID(ctx, currentUserID)
	if err != nil {
		log.Printf("Warning: couldn't get user info for response: %v", err)
	}

	var avatarURL *string
	if user.AvatarFilename != nil {
		avatarURL = buildAvatarURL(user.AvatarFilename)
	}

	log.Printf("Created comment %s on video %s by user %s", comment.ID, videoID, currentUserID)

	response.Created(w, CommentResponse{
		ID:               comment.ID.String(),
		VideoID:          comment.VideoID.String(),
		Content:          comment.Content,
		TimestampSeconds: comment.TimestampSeconds,
		ParentID:         pgUUIDToString(comment.ParentID),
		UserID:           comment.UserID.String(),
		AuthorUsername:   currentUsername,
		AuthorAvatarURL:  avatarURL,
		CreatedAt:        comment.CreatedAt,
		UpdatedAt:        comment.UpdatedAt,
		IsEdited:         false,
		CanEdit:          canEditComment(comment.UserID, currentUserID, comment.CreatedAt),
		CanDelete:        canDeleteComment(comment.UserID, videoOwnerID, currentUserID, isAdmin),
		ReplyCount:       0,
		Replies:          nil,
	})
}

// Update handles PATCH /api/comments/{comment_id}
func (h *CommentsHandler) Update(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Parse comment_id
	commentIDStr := r.PathValue("comment_id")
	if commentIDStr == "" {
		response.BadRequest(w, "Comment ID is required")
		return
	}

	commentID, err := uuid.Parse(commentIDStr)
	if err != nil {
		response.BadRequest(w, "Invalid comment ID format")
		return
	}

	// Get current user
	currentUserID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}
	isAdmin := middleware.IsAdmin(ctx)

	// Get comment with author and video owner
	comment, err := h.db.Queries.GetCommentWithAuthor(ctx, commentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Comment not found")
			return
		}
		log.Printf("Error getting comment: %v", err)
		response.InternalServerError(w, "Failed to get comment")
		return
	}

	// Check permission: author only can edit
	if comment.UserID != currentUserID {
		response.Forbidden(w, "You can only edit your own comments")
		return
	}

	// Check time window: within 24 hours
	if time.Since(comment.CreatedAt) >= time.Duration(commentEditWindowHours)*time.Hour {
		response.Forbidden(w, "Comment editing window (24h) has expired")
		return
	}

	// Parse request body
	var req CommentUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "Invalid request body")
		return
	}

	// Validate content
	content := strings.TrimSpace(req.Content)
	if content == "" {
		response.BadRequest(w, "Content is required")
		return
	}
	if len(content) > 2000 {
		response.BadRequest(w, "Content must be 2000 characters or less")
		return
	}

	// Update comment
	updatedComment, err := h.db.Queries.UpdateComment(ctx, sqlc.UpdateCommentParams{
		ID:      commentID,
		Content: content,
	})
	if err != nil {
		log.Printf("Error updating comment: %v", err)
		response.InternalServerError(w, "Failed to update comment")
		return
	}

	// Get reply count if this is a top-level comment
	var replyCount int64
	if !comment.ParentID.Valid {
		replyCount, _ = h.db.Queries.CountCommentsByVideo(ctx, comment.VideoID)
	}

	log.Printf("Updated comment %s by user %s", commentID, currentUserID)

	response.OK(w, CommentResponse{
		ID:               updatedComment.ID.String(),
		VideoID:          updatedComment.VideoID.String(),
		Content:          updatedComment.Content,
		TimestampSeconds: updatedComment.TimestampSeconds,
		ParentID:         pgUUIDToString(updatedComment.ParentID),
		UserID:           updatedComment.UserID.String(),
		AuthorUsername:   comment.AuthorUsername,
		AuthorAvatarURL:  buildAvatarURL(comment.AuthorAvatar),
		CreatedAt:        updatedComment.CreatedAt,
		UpdatedAt:        updatedComment.UpdatedAt,
		IsEdited:         isEdited(updatedComment.CreatedAt, updatedComment.UpdatedAt),
		CanEdit:          canEditComment(updatedComment.UserID, currentUserID, updatedComment.CreatedAt),
		CanDelete:        canDeleteComment(updatedComment.UserID, comment.VideoOwnerID, currentUserID, isAdmin),
		ReplyCount:       replyCount,
		Replies:          nil,
	})
}

// Delete handles DELETE /api/comments/{comment_id}
func (h *CommentsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Parse comment_id
	commentIDStr := r.PathValue("comment_id")
	if commentIDStr == "" {
		response.BadRequest(w, "Comment ID is required")
		return
	}

	commentID, err := uuid.Parse(commentIDStr)
	if err != nil {
		response.BadRequest(w, "Invalid comment ID format")
		return
	}

	// Get current user
	currentUserID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}
	isAdmin := middleware.IsAdmin(ctx)

	// Get comment with author and video owner
	comment, err := h.db.Queries.GetCommentWithAuthor(ctx, commentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Comment not found")
			return
		}
		log.Printf("Error getting comment: %v", err)
		response.InternalServerError(w, "Failed to get comment")
		return
	}

	// Check permission: author, video owner, or admin
	if !canDeleteComment(comment.UserID, comment.VideoOwnerID, currentUserID, isAdmin) {
		response.Forbidden(w, "You don't have permission to delete this comment")
		return
	}

	// Delete comment (cascade handles replies)
	if err := h.db.Queries.DeleteComment(ctx, commentID); err != nil {
		log.Printf("Error deleting comment: %v", err)
		response.InternalServerError(w, "Failed to delete comment")
		return
	}

	log.Printf("Deleted comment %s by user %s", commentID, currentUserID)

	response.NoContent(w)
}

// GetMarkers handles GET /api/videos/{video_id}/comment-markers
func (h *CommentsHandler) GetMarkers(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Parse video_id
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

	// Verify user is authenticated
	_, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	// Verify video exists
	_, err = h.db.Queries.GetVideoByID(ctx, videoID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Video not found")
			return
		}
		log.Printf("Error getting video: %v", err)
		response.InternalServerError(w, "Failed to get video")
		return
	}

	// Get markers
	markers, err := h.db.Queries.GetCommentMarkers(ctx, videoID)
	if err != nil {
		log.Printf("Error getting comment markers: %v", err)
		response.InternalServerError(w, "Failed to get comment markers")
		return
	}

	// Build response
	markerResponses := make([]CommentMarker, len(markers))
	for i, m := range markers {
		// timestamp_seconds should never be nil here due to the WHERE clause,
		// but handle it defensively
		seconds := int32(0)
		if m.TimestampSeconds != nil {
			seconds = *m.TimestampSeconds
		}
		markerResponses[i] = CommentMarker{
			Seconds: seconds,
			Count:   m.Count,
		}
	}

	response.OK(w, markerResponses)
}

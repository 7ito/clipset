package migrate

import (
	"context"
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

// SQLiteDB wraps the SQLite database connection
type SQLiteDB struct {
	db *sql.DB
}

// ConnectSQLite opens a SQLite database in read-only mode
func ConnectSQLite(path string) (*SQLiteDB, error) {
	// Open with read-only mode
	dsn := fmt.Sprintf("file:%s?mode=ro", path)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open SQLite database: %w", err)
	}

	// Verify connection
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping SQLite database: %w", err)
	}

	return &SQLiteDB{db: db}, nil
}

// Close closes the database connection
func (s *SQLiteDB) Close() error {
	return s.db.Close()
}

// SQLite row types matching the Python/SQLAlchemy models

// SQLiteUser represents a user row from SQLite
type SQLiteUser struct {
	ID                string
	Email             string
	Username          string
	PasswordHash      string
	Role              string
	CreatedAt         string
	IsActive          bool
	AvatarFilename    *string
	WeeklyUploadBytes int64
	LastUploadReset   string
}

// SQLiteInvitation represents an invitation row from SQLite
type SQLiteInvitation struct {
	ID        string
	Email     string
	Token     string
	CreatedBy string
	CreatedAt string
	ExpiresAt string
	Used      bool
	UsedAt    *string
}

// SQLiteCategory represents a category row from SQLite
type SQLiteCategory struct {
	ID            string
	Name          string
	Slug          string
	Description   *string
	ImageFilename *string
	CreatedBy     string
	CreatedAt     string
	UpdatedAt     *string
}

// SQLiteVideo represents a video row from SQLite
type SQLiteVideo struct {
	ID                string
	ShortID           string
	Title             string
	Description       *string
	Filename          string
	ThumbnailFilename *string
	OriginalFilename  string
	StoragePath       *string
	FileSizeBytes     int64
	DurationSeconds   *int
	UploadedBy        string
	CategoryID        *string
	ViewCount         int
	ProcessingStatus  string
	ErrorMessage      *string
	CreatedAt         string
}

// SQLitePlaylist represents a playlist row from SQLite
type SQLitePlaylist struct {
	ID          string
	ShortID     string
	Name        string
	Description *string
	CreatedBy   string
	IsPublic    bool
	CreatedAt   string
	UpdatedAt   string
}

// SQLitePlaylistVideo represents a playlist_videos row from SQLite
type SQLitePlaylistVideo struct {
	ID         string
	PlaylistID string
	VideoID    string
	Position   int
	AddedAt    string
	AddedBy    *string
}

// SQLiteComment represents a comment row from SQLite
type SQLiteComment struct {
	ID               string
	VideoID          string
	UserID           string
	Content          string
	TimestampSeconds *int
	ParentID         *string
	CreatedAt        string
	UpdatedAt        string
}

// SQLiteConfig represents the config row from SQLite
type SQLiteConfig struct {
	ID                     int
	MaxFileSizeBytes       int64
	WeeklyUploadLimitBytes int64
	VideoStoragePath       string
	UseGPUTranscoding      bool
	GPUDeviceID            int
	NVENCPreset            string
	NVENCCQ                int
	NVENCRateControl       string
	NVENCMaxBitrate        string
	NVENCBufferSize        string
	CPUPreset              string
	CPUCRF                 int
	MaxResolution          string
	AudioBitrate           string
	TranscodePresetMode    string
	VideoOutputFormat      string
	UpdatedAt              string
	UpdatedBy              *string
}

// Count methods

// CountUsers returns the total number of users
func (s *SQLiteDB) CountUsers(ctx context.Context) (int64, error) {
	return s.count(ctx, "users")
}

// CountInvitations returns the total number of invitations
func (s *SQLiteDB) CountInvitations(ctx context.Context) (int64, error) {
	return s.count(ctx, "invitations")
}

// CountCategories returns the total number of categories
func (s *SQLiteDB) CountCategories(ctx context.Context) (int64, error) {
	return s.count(ctx, "categories")
}

// CountVideos returns the total number of videos
func (s *SQLiteDB) CountVideos(ctx context.Context) (int64, error) {
	return s.count(ctx, "videos")
}

// CountPlaylists returns the total number of playlists
func (s *SQLiteDB) CountPlaylists(ctx context.Context) (int64, error) {
	return s.count(ctx, "playlists")
}

// CountPlaylistVideos returns the total number of playlist_videos
func (s *SQLiteDB) CountPlaylistVideos(ctx context.Context) (int64, error) {
	return s.count(ctx, "playlist_videos")
}

// CountComments returns the total number of comments
func (s *SQLiteDB) CountComments(ctx context.Context) (int64, error) {
	return s.count(ctx, "comments")
}

// CountPasswordResetTokens returns the total number of password_reset_tokens
func (s *SQLiteDB) CountPasswordResetTokens(ctx context.Context) (int64, error) {
	return s.count(ctx, "password_reset_tokens")
}

// CountConfig returns the number of config rows (should be 0 or 1)
func (s *SQLiteDB) CountConfig(ctx context.Context) (int64, error) {
	return s.count(ctx, "config")
}

func (s *SQLiteDB) count(ctx context.Context, table string) (int64, error) {
	var count int64
	query := fmt.Sprintf("SELECT COUNT(*) FROM %s", table)
	err := s.db.QueryRowContext(ctx, query).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count %s: %w", table, err)
	}
	return count, nil
}

// GetAllCounts returns counts for all tables
func (s *SQLiteDB) GetAllCounts(ctx context.Context) (map[string]int64, error) {
	counts := make(map[string]int64)

	tables := []string{
		"users", "invitations", "categories", "videos",
		"playlists", "playlist_videos", "comments",
		"password_reset_tokens", "config",
	}

	for _, table := range tables {
		count, err := s.count(ctx, table)
		if err != nil {
			return nil, err
		}
		counts[table] = count
	}

	return counts, nil
}

// Query methods with pagination

// GetUsers returns users with pagination
func (s *SQLiteDB) GetUsers(ctx context.Context, offset, limit int) ([]SQLiteUser, error) {
	query := `
		SELECT id, email, username, password_hash, role, created_at,
			   is_active, avatar_filename, weekly_upload_bytes, last_upload_reset
		FROM users
		ORDER BY created_at ASC
		LIMIT ? OFFSET ?`

	rows, err := s.db.QueryContext(ctx, query, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to query users: %w", err)
	}
	defer rows.Close()

	var users []SQLiteUser
	for rows.Next() {
		var u SQLiteUser
		err := rows.Scan(
			&u.ID, &u.Email, &u.Username, &u.PasswordHash, &u.Role, &u.CreatedAt,
			&u.IsActive, &u.AvatarFilename, &u.WeeklyUploadBytes, &u.LastUploadReset,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan user row: %w", err)
		}
		users = append(users, u)
	}

	return users, rows.Err()
}

// GetInvitations returns invitations with pagination
func (s *SQLiteDB) GetInvitations(ctx context.Context, offset, limit int) ([]SQLiteInvitation, error) {
	query := `
		SELECT id, email, token, created_by, created_at, expires_at, used, used_at
		FROM invitations
		ORDER BY created_at ASC
		LIMIT ? OFFSET ?`

	rows, err := s.db.QueryContext(ctx, query, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to query invitations: %w", err)
	}
	defer rows.Close()

	var invitations []SQLiteInvitation
	for rows.Next() {
		var inv SQLiteInvitation
		err := rows.Scan(
			&inv.ID, &inv.Email, &inv.Token, &inv.CreatedBy,
			&inv.CreatedAt, &inv.ExpiresAt, &inv.Used, &inv.UsedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan invitation row: %w", err)
		}
		invitations = append(invitations, inv)
	}

	return invitations, rows.Err()
}

// GetCategories returns categories with pagination
func (s *SQLiteDB) GetCategories(ctx context.Context, offset, limit int) ([]SQLiteCategory, error) {
	query := `
		SELECT id, name, slug, description, image_filename, created_by, created_at, updated_at
		FROM categories
		ORDER BY created_at ASC
		LIMIT ? OFFSET ?`

	rows, err := s.db.QueryContext(ctx, query, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to query categories: %w", err)
	}
	defer rows.Close()

	var categories []SQLiteCategory
	for rows.Next() {
		var c SQLiteCategory
		err := rows.Scan(
			&c.ID, &c.Name, &c.Slug, &c.Description, &c.ImageFilename,
			&c.CreatedBy, &c.CreatedAt, &c.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan category row: %w", err)
		}
		categories = append(categories, c)
	}

	return categories, rows.Err()
}

// GetVideos returns videos with pagination
func (s *SQLiteDB) GetVideos(ctx context.Context, offset, limit int) ([]SQLiteVideo, error) {
	query := `
		SELECT id, short_id, title, description, filename, thumbnail_filename,
			   original_filename, storage_path, file_size_bytes, duration_seconds,
			   uploaded_by, category_id, view_count, processing_status, error_message, created_at
		FROM videos
		ORDER BY created_at ASC
		LIMIT ? OFFSET ?`

	rows, err := s.db.QueryContext(ctx, query, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to query videos: %w", err)
	}
	defer rows.Close()

	var videos []SQLiteVideo
	for rows.Next() {
		var v SQLiteVideo
		err := rows.Scan(
			&v.ID, &v.ShortID, &v.Title, &v.Description, &v.Filename, &v.ThumbnailFilename,
			&v.OriginalFilename, &v.StoragePath, &v.FileSizeBytes, &v.DurationSeconds,
			&v.UploadedBy, &v.CategoryID, &v.ViewCount, &v.ProcessingStatus, &v.ErrorMessage, &v.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan video row: %w", err)
		}
		videos = append(videos, v)
	}

	return videos, rows.Err()
}

// GetPlaylists returns playlists with pagination
func (s *SQLiteDB) GetPlaylists(ctx context.Context, offset, limit int) ([]SQLitePlaylist, error) {
	query := `
		SELECT id, short_id, name, description, created_by, is_public, created_at, updated_at
		FROM playlists
		ORDER BY created_at ASC
		LIMIT ? OFFSET ?`

	rows, err := s.db.QueryContext(ctx, query, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to query playlists: %w", err)
	}
	defer rows.Close()

	var playlists []SQLitePlaylist
	for rows.Next() {
		var p SQLitePlaylist
		err := rows.Scan(
			&p.ID, &p.ShortID, &p.Name, &p.Description,
			&p.CreatedBy, &p.IsPublic, &p.CreatedAt, &p.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan playlist row: %w", err)
		}
		playlists = append(playlists, p)
	}

	return playlists, rows.Err()
}

// GetPlaylistVideos returns playlist_videos with pagination
func (s *SQLiteDB) GetPlaylistVideos(ctx context.Context, offset, limit int) ([]SQLitePlaylistVideo, error) {
	query := `
		SELECT id, playlist_id, video_id, position, added_at, added_by
		FROM playlist_videos
		ORDER BY added_at ASC
		LIMIT ? OFFSET ?`

	rows, err := s.db.QueryContext(ctx, query, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to query playlist_videos: %w", err)
	}
	defer rows.Close()

	var pvs []SQLitePlaylistVideo
	for rows.Next() {
		var pv SQLitePlaylistVideo
		err := rows.Scan(
			&pv.ID, &pv.PlaylistID, &pv.VideoID,
			&pv.Position, &pv.AddedAt, &pv.AddedBy,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan playlist_video row: %w", err)
		}
		pvs = append(pvs, pv)
	}

	return pvs, rows.Err()
}

// GetComments returns comments with pagination
func (s *SQLiteDB) GetComments(ctx context.Context, offset, limit int) ([]SQLiteComment, error) {
	query := `
		SELECT id, video_id, user_id, content, timestamp_seconds, parent_id, created_at, updated_at
		FROM comments
		ORDER BY created_at ASC
		LIMIT ? OFFSET ?`

	rows, err := s.db.QueryContext(ctx, query, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to query comments: %w", err)
	}
	defer rows.Close()

	var comments []SQLiteComment
	for rows.Next() {
		var c SQLiteComment
		err := rows.Scan(
			&c.ID, &c.VideoID, &c.UserID, &c.Content,
			&c.TimestampSeconds, &c.ParentID, &c.CreatedAt, &c.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan comment row: %w", err)
		}
		comments = append(comments, c)
	}

	return comments, rows.Err()
}

// GetConfig returns the config row (if exists)
func (s *SQLiteDB) GetConfig(ctx context.Context) (*SQLiteConfig, error) {
	query := `
		SELECT id, max_file_size_bytes, weekly_upload_limit_bytes, video_storage_path,
			   use_gpu_transcoding, gpu_device_id, nvenc_preset, nvenc_cq,
			   nvenc_rate_control, nvenc_max_bitrate, nvenc_buffer_size,
			   cpu_preset, cpu_crf, max_resolution, audio_bitrate,
			   transcode_preset_mode, video_output_format, updated_at, updated_by
		FROM config
		WHERE id = 1`

	var c SQLiteConfig
	err := s.db.QueryRowContext(ctx, query).Scan(
		&c.ID, &c.MaxFileSizeBytes, &c.WeeklyUploadLimitBytes, &c.VideoStoragePath,
		&c.UseGPUTranscoding, &c.GPUDeviceID, &c.NVENCPreset, &c.NVENCCQ,
		&c.NVENCRateControl, &c.NVENCMaxBitrate, &c.NVENCBufferSize,
		&c.CPUPreset, &c.CPUCRF, &c.MaxResolution, &c.AudioBitrate,
		&c.TranscodePresetMode, &c.VideoOutputFormat, &c.UpdatedAt, &c.UpdatedBy,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query config: %w", err)
	}

	return &c, nil
}

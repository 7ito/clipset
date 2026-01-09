package migrate

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MigrateUsers migrates the users table
func MigrateUsers(ctx context.Context, sqlite *SQLiteDB, pg *pgxpool.Pool, batchSize int, dryRun bool, progress *Progress) (int64, error) {
	total, err := sqlite.CountUsers(ctx)
	if err != nil {
		return 0, err
	}

	if total == 0 {
		return 0, nil
	}

	progress.Start("users", total)

	if dryRun {
		progress.Complete()
		return total, nil
	}

	var migrated int64
	offset := 0

	for {
		users, err := sqlite.GetUsers(ctx, offset, batchSize)
		if err != nil {
			return migrated, err
		}

		if len(users) == 0 {
			break
		}

		// Start transaction for this batch
		tx, err := pg.Begin(ctx)
		if err != nil {
			return migrated, fmt.Errorf("failed to begin transaction: %w", err)
		}

		// Use COPY for fast bulk insert
		_, err = tx.CopyFrom(
			ctx,
			pgx.Identifier{"users"},
			[]string{"id", "email", "username", "password_hash", "role", "created_at",
				"is_active", "avatar_filename", "weekly_upload_bytes", "last_upload_reset"},
			pgx.CopyFromSlice(len(users), func(i int) ([]any, error) {
				u := users[i]

				id, err := ParseUUID(u.ID)
				if err != nil {
					return nil, fmt.Errorf("user %d: %w", offset+i, err)
				}

				role, err := ConvertUserRole(u.Role)
				if err != nil {
					return nil, fmt.Errorf("user %d: %w", offset+i, err)
				}

				createdAt, err := ParseTimestamp(u.CreatedAt)
				if err != nil {
					return nil, fmt.Errorf("user %d created_at: %w", offset+i, err)
				}

				lastUploadReset, err := ParseTimestamp(u.LastUploadReset)
				if err != nil {
					return nil, fmt.Errorf("user %d last_upload_reset: %w", offset+i, err)
				}

				return []any{
					id,
					NormalizeEmail(u.Email),
					NormalizeUsername(u.Username),
					u.PasswordHash,
					role,
					createdAt,
					u.IsActive,
					NullableString(u.AvatarFilename),
					u.WeeklyUploadBytes,
					lastUploadReset,
				}, nil
			}),
		)
		if err != nil {
			tx.Rollback(ctx)
			return migrated, fmt.Errorf("failed to copy users: %w", err)
		}

		if err := tx.Commit(ctx); err != nil {
			return migrated, fmt.Errorf("failed to commit users: %w", err)
		}

		migrated += int64(len(users))
		progress.Update(migrated)
		offset += batchSize
	}

	progress.Complete()
	return migrated, nil
}

// MigrateConfig migrates the config table (UPDATE only, since PG already has default row)
func MigrateConfig(ctx context.Context, sqlite *SQLiteDB, pg *pgxpool.Pool, dryRun bool, progress *Progress) error {
	config, err := sqlite.GetConfig(ctx)
	if err != nil {
		return err
	}

	if config == nil {
		progress.Start("config", 0)
		progress.Complete()
		return nil
	}

	progress.Start("config", 1)

	if dryRun {
		progress.Complete()
		return nil
	}

	updatedAt, err := ParseTimestamp(config.UpdatedAt)
	if err != nil {
		return fmt.Errorf("config updated_at: %w", err)
	}

	var updatedBy *uuid.UUID
	if config.UpdatedBy != nil && *config.UpdatedBy != "" {
		id, err := ParseUUID(*config.UpdatedBy)
		if err != nil {
			return fmt.Errorf("config updated_by: %w", err)
		}
		updatedBy = &id
	}

	_, err = pg.Exec(ctx, `
		UPDATE config SET
			max_file_size_bytes = $1,
			weekly_upload_limit_bytes = $2,
			video_storage_path = $3,
			use_gpu_transcoding = $4,
			gpu_device_id = $5,
			nvenc_preset = $6,
			nvenc_cq = $7,
			nvenc_rate_control = $8,
			nvenc_max_bitrate = $9,
			nvenc_buffer_size = $10,
			cpu_preset = $11,
			cpu_crf = $12,
			max_resolution = $13,
			audio_bitrate = $14,
			transcode_preset_mode = $15,
			video_output_format = $16,
			updated_at = $17,
			updated_by = $18
		WHERE id = 1`,
		config.MaxFileSizeBytes,
		config.WeeklyUploadLimitBytes,
		config.VideoStoragePath,
		config.UseGPUTranscoding,
		config.GPUDeviceID,
		config.NVENCPreset,
		config.NVENCCQ,
		config.NVENCRateControl,
		config.NVENCMaxBitrate,
		config.NVENCBufferSize,
		config.CPUPreset,
		config.CPUCRF,
		config.MaxResolution,
		config.AudioBitrate,
		config.TranscodePresetMode,
		config.VideoOutputFormat,
		updatedAt,
		updatedBy,
	)
	if err != nil {
		return fmt.Errorf("failed to update config: %w", err)
	}

	progress.Complete()
	return nil
}

// MigrateInvitations migrates the invitations table
func MigrateInvitations(ctx context.Context, sqlite *SQLiteDB, pg *pgxpool.Pool, batchSize int, dryRun bool, progress *Progress) (int64, error) {
	total, err := sqlite.CountInvitations(ctx)
	if err != nil {
		return 0, err
	}

	if total == 0 {
		progress.Start("invitations", 0)
		progress.Complete()
		return 0, nil
	}

	progress.Start("invitations", total)

	if dryRun {
		progress.Complete()
		return total, nil
	}

	var migrated int64
	offset := 0

	for {
		invitations, err := sqlite.GetInvitations(ctx, offset, batchSize)
		if err != nil {
			return migrated, err
		}

		if len(invitations) == 0 {
			break
		}

		tx, err := pg.Begin(ctx)
		if err != nil {
			return migrated, fmt.Errorf("failed to begin transaction: %w", err)
		}

		_, err = tx.CopyFrom(
			ctx,
			pgx.Identifier{"invitations"},
			[]string{"id", "email", "token", "created_by", "created_at", "expires_at", "used", "used_at"},
			pgx.CopyFromSlice(len(invitations), func(i int) ([]any, error) {
				inv := invitations[i]

				id, err := ParseUUID(inv.ID)
				if err != nil {
					return nil, fmt.Errorf("invitation %d: %w", offset+i, err)
				}

				createdBy, err := ParseUUID(inv.CreatedBy)
				if err != nil {
					return nil, fmt.Errorf("invitation %d created_by: %w", offset+i, err)
				}

				createdAt, err := ParseTimestamp(inv.CreatedAt)
				if err != nil {
					return nil, fmt.Errorf("invitation %d created_at: %w", offset+i, err)
				}

				expiresAt, err := ParseTimestamp(inv.ExpiresAt)
				if err != nil {
					return nil, fmt.Errorf("invitation %d expires_at: %w", offset+i, err)
				}

				usedAt, err := ParseNullableTimestamp(inv.UsedAt)
				if err != nil {
					return nil, fmt.Errorf("invitation %d used_at: %w", offset+i, err)
				}

				return []any{
					id,
					NormalizeEmail(inv.Email),
					inv.Token,
					createdBy,
					createdAt,
					expiresAt,
					inv.Used,
					usedAt,
				}, nil
			}),
		)
		if err != nil {
			tx.Rollback(ctx)
			return migrated, fmt.Errorf("failed to copy invitations: %w", err)
		}

		if err := tx.Commit(ctx); err != nil {
			return migrated, fmt.Errorf("failed to commit invitations: %w", err)
		}

		migrated += int64(len(invitations))
		progress.Update(migrated)
		offset += batchSize
	}

	progress.Complete()
	return migrated, nil
}

// MigrateCategories migrates the categories table
func MigrateCategories(ctx context.Context, sqlite *SQLiteDB, pg *pgxpool.Pool, batchSize int, dryRun bool, progress *Progress) (int64, error) {
	total, err := sqlite.CountCategories(ctx)
	if err != nil {
		return 0, err
	}

	if total == 0 {
		progress.Start("categories", 0)
		progress.Complete()
		return 0, nil
	}

	progress.Start("categories", total)

	if dryRun {
		progress.Complete()
		return total, nil
	}

	var migrated int64
	offset := 0

	for {
		categories, err := sqlite.GetCategories(ctx, offset, batchSize)
		if err != nil {
			return migrated, err
		}

		if len(categories) == 0 {
			break
		}

		tx, err := pg.Begin(ctx)
		if err != nil {
			return migrated, fmt.Errorf("failed to begin transaction: %w", err)
		}

		_, err = tx.CopyFrom(
			ctx,
			pgx.Identifier{"categories"},
			[]string{"id", "name", "slug", "description", "image_filename", "created_by", "created_at", "updated_at"},
			pgx.CopyFromSlice(len(categories), func(i int) ([]any, error) {
				c := categories[i]

				id, err := ParseUUID(c.ID)
				if err != nil {
					return nil, fmt.Errorf("category %d: %w", offset+i, err)
				}

				createdBy, err := ParseUUID(c.CreatedBy)
				if err != nil {
					return nil, fmt.Errorf("category %d created_by: %w", offset+i, err)
				}

				createdAt, err := ParseTimestamp(c.CreatedAt)
				if err != nil {
					return nil, fmt.Errorf("category %d created_at: %w", offset+i, err)
				}

				// Default updated_at to created_at if null
				var updatedAt time.Time
				if c.UpdatedAt != nil {
					updatedAt, err = ParseTimestamp(*c.UpdatedAt)
					if err != nil {
						return nil, fmt.Errorf("category %d updated_at: %w", offset+i, err)
					}
				} else {
					updatedAt = createdAt
				}

				return []any{
					id,
					c.Name,
					c.Slug,
					NullableString(c.Description),
					NullableString(c.ImageFilename),
					createdBy,
					createdAt,
					updatedAt,
				}, nil
			}),
		)
		if err != nil {
			tx.Rollback(ctx)
			return migrated, fmt.Errorf("failed to copy categories: %w", err)
		}

		if err := tx.Commit(ctx); err != nil {
			return migrated, fmt.Errorf("failed to commit categories: %w", err)
		}

		migrated += int64(len(categories))
		progress.Update(migrated)
		offset += batchSize
	}

	progress.Complete()
	return migrated, nil
}

// MigrateVideos migrates the videos table
func MigrateVideos(ctx context.Context, sqlite *SQLiteDB, pg *pgxpool.Pool, batchSize int, dryRun bool, progress *Progress) (int64, error) {
	total, err := sqlite.CountVideos(ctx)
	if err != nil {
		return 0, err
	}

	if total == 0 {
		progress.Start("videos", 0)
		progress.Complete()
		return 0, nil
	}

	progress.Start("videos", total)

	if dryRun {
		progress.Complete()
		return total, nil
	}

	var migrated int64
	offset := 0

	for {
		videos, err := sqlite.GetVideos(ctx, offset, batchSize)
		if err != nil {
			return migrated, err
		}

		if len(videos) == 0 {
			break
		}

		tx, err := pg.Begin(ctx)
		if err != nil {
			return migrated, fmt.Errorf("failed to begin transaction: %w", err)
		}

		_, err = tx.CopyFrom(
			ctx,
			pgx.Identifier{"videos"},
			[]string{"id", "short_id", "title", "description", "filename", "thumbnail_filename",
				"original_filename", "storage_path", "file_size_bytes", "duration_seconds",
				"uploaded_by", "category_id", "view_count", "processing_status", "error_message", "created_at"},
			pgx.CopyFromSlice(len(videos), func(i int) ([]any, error) {
				v := videos[i]

				id, err := ParseUUID(v.ID)
				if err != nil {
					return nil, fmt.Errorf("video %d: %w", offset+i, err)
				}

				uploadedBy, err := ParseUUID(v.UploadedBy)
				if err != nil {
					return nil, fmt.Errorf("video %d uploaded_by: %w", offset+i, err)
				}

				categoryID, err := ParseNullableUUID(v.CategoryID)
				if err != nil {
					return nil, fmt.Errorf("video %d category_id: %w", offset+i, err)
				}

				createdAt, err := ParseTimestamp(v.CreatedAt)
				if err != nil {
					return nil, fmt.Errorf("video %d created_at: %w", offset+i, err)
				}

				status, err := ConvertProcessingStatus(v.ProcessingStatus)
				if err != nil {
					return nil, fmt.Errorf("video %d processing_status: %w", offset+i, err)
				}

				var durationSeconds *int32
				if v.DurationSeconds != nil {
					d := int32(*v.DurationSeconds)
					durationSeconds = &d
				}

				return []any{
					id,
					v.ShortID,
					v.Title,
					NullableString(v.Description),
					v.Filename,
					NullableString(v.ThumbnailFilename),
					v.OriginalFilename,
					NullableString(v.StoragePath),
					v.FileSizeBytes,
					durationSeconds,
					uploadedBy,
					categoryID,
					int32(v.ViewCount),
					status,
					NullableString(v.ErrorMessage),
					createdAt,
				}, nil
			}),
		)
		if err != nil {
			tx.Rollback(ctx)
			return migrated, fmt.Errorf("failed to copy videos: %w", err)
		}

		if err := tx.Commit(ctx); err != nil {
			return migrated, fmt.Errorf("failed to commit videos: %w", err)
		}

		migrated += int64(len(videos))
		progress.Update(migrated)
		offset += batchSize
	}

	progress.Complete()
	return migrated, nil
}

// MigratePlaylists migrates the playlists table
func MigratePlaylists(ctx context.Context, sqlite *SQLiteDB, pg *pgxpool.Pool, batchSize int, dryRun bool, progress *Progress) (int64, error) {
	total, err := sqlite.CountPlaylists(ctx)
	if err != nil {
		return 0, err
	}

	if total == 0 {
		progress.Start("playlists", 0)
		progress.Complete()
		return 0, nil
	}

	progress.Start("playlists", total)

	if dryRun {
		progress.Complete()
		return total, nil
	}

	var migrated int64
	offset := 0

	for {
		playlists, err := sqlite.GetPlaylists(ctx, offset, batchSize)
		if err != nil {
			return migrated, err
		}

		if len(playlists) == 0 {
			break
		}

		tx, err := pg.Begin(ctx)
		if err != nil {
			return migrated, fmt.Errorf("failed to begin transaction: %w", err)
		}

		_, err = tx.CopyFrom(
			ctx,
			pgx.Identifier{"playlists"},
			[]string{"id", "short_id", "name", "description", "created_by", "is_public", "created_at", "updated_at"},
			pgx.CopyFromSlice(len(playlists), func(i int) ([]any, error) {
				p := playlists[i]

				id, err := ParseUUID(p.ID)
				if err != nil {
					return nil, fmt.Errorf("playlist %d: %w", offset+i, err)
				}

				createdBy, err := ParseUUID(p.CreatedBy)
				if err != nil {
					return nil, fmt.Errorf("playlist %d created_by: %w", offset+i, err)
				}

				createdAt, err := ParseTimestamp(p.CreatedAt)
				if err != nil {
					return nil, fmt.Errorf("playlist %d created_at: %w", offset+i, err)
				}

				updatedAt, err := ParseTimestamp(p.UpdatedAt)
				if err != nil {
					return nil, fmt.Errorf("playlist %d updated_at: %w", offset+i, err)
				}

				return []any{
					id,
					p.ShortID,
					p.Name,
					NullableString(p.Description),
					createdBy,
					p.IsPublic,
					createdAt,
					updatedAt,
				}, nil
			}),
		)
		if err != nil {
			tx.Rollback(ctx)
			return migrated, fmt.Errorf("failed to copy playlists: %w", err)
		}

		if err := tx.Commit(ctx); err != nil {
			return migrated, fmt.Errorf("failed to commit playlists: %w", err)
		}

		migrated += int64(len(playlists))
		progress.Update(migrated)
		offset += batchSize
	}

	progress.Complete()
	return migrated, nil
}

// MigratePlaylistVideos migrates the playlist_videos table
func MigratePlaylistVideos(ctx context.Context, sqlite *SQLiteDB, pg *pgxpool.Pool, batchSize int, dryRun bool, progress *Progress) (int64, error) {
	total, err := sqlite.CountPlaylistVideos(ctx)
	if err != nil {
		return 0, err
	}

	if total == 0 {
		progress.Start("playlist_videos", 0)
		progress.Complete()
		return 0, nil
	}

	progress.Start("playlist_videos", total)

	if dryRun {
		progress.Complete()
		return total, nil
	}

	var migrated int64
	offset := 0

	for {
		pvs, err := sqlite.GetPlaylistVideos(ctx, offset, batchSize)
		if err != nil {
			return migrated, err
		}

		if len(pvs) == 0 {
			break
		}

		tx, err := pg.Begin(ctx)
		if err != nil {
			return migrated, fmt.Errorf("failed to begin transaction: %w", err)
		}

		_, err = tx.CopyFrom(
			ctx,
			pgx.Identifier{"playlist_videos"},
			[]string{"id", "playlist_id", "video_id", "position", "added_at", "added_by"},
			pgx.CopyFromSlice(len(pvs), func(i int) ([]any, error) {
				pv := pvs[i]

				id, err := ParseUUID(pv.ID)
				if err != nil {
					return nil, fmt.Errorf("playlist_video %d: %w", offset+i, err)
				}

				playlistID, err := ParseUUID(pv.PlaylistID)
				if err != nil {
					return nil, fmt.Errorf("playlist_video %d playlist_id: %w", offset+i, err)
				}

				videoID, err := ParseUUID(pv.VideoID)
				if err != nil {
					return nil, fmt.Errorf("playlist_video %d video_id: %w", offset+i, err)
				}

				addedAt, err := ParseTimestamp(pv.AddedAt)
				if err != nil {
					return nil, fmt.Errorf("playlist_video %d added_at: %w", offset+i, err)
				}

				addedBy, err := ParseNullableUUID(pv.AddedBy)
				if err != nil {
					return nil, fmt.Errorf("playlist_video %d added_by: %w", offset+i, err)
				}

				return []any{
					id,
					playlistID,
					videoID,
					int32(pv.Position),
					addedAt,
					addedBy,
				}, nil
			}),
		)
		if err != nil {
			tx.Rollback(ctx)
			return migrated, fmt.Errorf("failed to copy playlist_videos: %w", err)
		}

		if err := tx.Commit(ctx); err != nil {
			return migrated, fmt.Errorf("failed to commit playlist_videos: %w", err)
		}

		migrated += int64(len(pvs))
		progress.Update(migrated)
		offset += batchSize
	}

	progress.Complete()
	return migrated, nil
}

// MigrateComments migrates the comments table (two-pass for self-referential FK)
func MigrateComments(ctx context.Context, sqlite *SQLiteDB, pg *pgxpool.Pool, batchSize int, dryRun bool, progress *Progress) (int64, error) {
	total, err := sqlite.CountComments(ctx)
	if err != nil {
		return 0, err
	}

	if total == 0 {
		progress.Start("comments", 0)
		progress.Complete()
		return 0, nil
	}

	progress.Start("comments", total)

	if dryRun {
		progress.Complete()
		return total, nil
	}

	// Collect all comments and their parent relationships for two-pass insert
	var allComments []SQLiteComment
	offset := 0

	for {
		comments, err := sqlite.GetComments(ctx, offset, batchSize)
		if err != nil {
			return 0, err
		}

		if len(comments) == 0 {
			break
		}

		allComments = append(allComments, comments...)
		offset += batchSize
	}

	// Pass 1: Insert all comments with parent_id = NULL
	tx, err := pg.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("failed to begin transaction: %w", err)
	}

	_, err = tx.CopyFrom(
		ctx,
		pgx.Identifier{"comments"},
		[]string{"id", "video_id", "user_id", "content", "timestamp_seconds", "parent_id", "created_at", "updated_at"},
		pgx.CopyFromSlice(len(allComments), func(i int) ([]any, error) {
			c := allComments[i]

			id, err := ParseUUID(c.ID)
			if err != nil {
				return nil, fmt.Errorf("comment %d: %w", i, err)
			}

			videoID, err := ParseUUID(c.VideoID)
			if err != nil {
				return nil, fmt.Errorf("comment %d video_id: %w", i, err)
			}

			userID, err := ParseUUID(c.UserID)
			if err != nil {
				return nil, fmt.Errorf("comment %d user_id: %w", i, err)
			}

			createdAt, err := ParseTimestamp(c.CreatedAt)
			if err != nil {
				return nil, fmt.Errorf("comment %d created_at: %w", i, err)
			}

			updatedAt, err := ParseTimestamp(c.UpdatedAt)
			if err != nil {
				return nil, fmt.Errorf("comment %d updated_at: %w", i, err)
			}

			var timestampSeconds *int32
			if c.TimestampSeconds != nil {
				t := int32(*c.TimestampSeconds)
				timestampSeconds = &t
			}

			// Insert with NULL parent_id first
			return []any{
				id,
				videoID,
				userID,
				c.Content,
				timestampSeconds,
				nil, // parent_id = NULL for first pass
				createdAt,
				updatedAt,
			}, nil
		}),
	)
	if err != nil {
		tx.Rollback(ctx)
		return 0, fmt.Errorf("failed to copy comments (pass 1): %w", err)
	}

	// Pass 2: Update parent_id for replies
	repliesUpdated := 0
	for _, c := range allComments {
		if c.ParentID == nil || *c.ParentID == "" {
			continue
		}

		id, err := ParseUUID(c.ID)
		if err != nil {
			tx.Rollback(ctx)
			return 0, fmt.Errorf("comment parent update: %w", err)
		}

		parentID, err := ParseUUID(*c.ParentID)
		if err != nil {
			tx.Rollback(ctx)
			return 0, fmt.Errorf("comment %s parent_id: %w", c.ID, err)
		}

		_, err = tx.Exec(ctx, "UPDATE comments SET parent_id = $1 WHERE id = $2", parentID, id)
		if err != nil {
			tx.Rollback(ctx)
			return 0, fmt.Errorf("failed to update comment parent_id: %w", err)
		}
		repliesUpdated++
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("failed to commit comments: %w", err)
	}

	progress.Complete()
	return int64(len(allComments)), nil
}

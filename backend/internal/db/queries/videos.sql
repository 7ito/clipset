-- name: GetVideoByID :one
SELECT * FROM videos WHERE id = $1;

-- name: GetVideoByShortID :one
SELECT * FROM videos WHERE short_id = $1;

-- name: CreateVideo :one
INSERT INTO videos (
    short_id, title, description, filename, original_filename,
    file_size_bytes, uploaded_by, category_id, storage_path
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9
) RETURNING *;

-- name: UpdateVideo :one
UPDATE videos SET
    title = COALESCE(NULLIF($2, ''), title),
    description = $3,
    category_id = $4
WHERE id = $1
RETURNING *;

-- name: UpdateVideoProcessing :one
UPDATE videos SET
    processing_status = $2,
    error_message = $3,
    duration_seconds = $4,
    file_size_bytes = COALESCE($5, file_size_bytes),
    filename = COALESCE(NULLIF($6, ''), filename),
    thumbnail_filename = COALESCE(NULLIF($7, ''), thumbnail_filename)
WHERE id = $1
RETURNING *;

-- name: DeleteVideo :exec
DELETE FROM videos WHERE id = $1;

-- name: ListVideos :many
SELECT 
    v.*,
    u.username as uploader_username,
    c.name as category_name,
    c.slug as category_slug
FROM videos v
JOIN users u ON v.uploaded_by = u.id
LEFT JOIN categories c ON v.category_id = c.id
WHERE 
    ($1::uuid IS NULL OR v.category_id = $1)
    AND ($2::text IS NULL OR v.processing_status::text = $2)
    AND ($3::uuid IS NULL OR v.uploaded_by = $3)
    AND (
        $4::text IS NULL OR $4 = '' OR
        LOWER(v.title) LIKE '%' || LOWER($4) || '%' OR
        LOWER(v.description) LIKE '%' || LOWER($4) || '%'
    )
ORDER BY
    CASE WHEN $5 = 'created_at' AND $6 = 'desc' THEN v.created_at END DESC,
    CASE WHEN $5 = 'created_at' AND $6 = 'asc' THEN v.created_at END ASC,
    CASE WHEN $5 = 'title' AND $6 = 'desc' THEN v.title END DESC,
    CASE WHEN $5 = 'title' AND $6 = 'asc' THEN v.title END ASC,
    CASE WHEN $5 = 'view_count' AND $6 = 'desc' THEN v.view_count END DESC,
    CASE WHEN $5 = 'view_count' AND $6 = 'asc' THEN v.view_count END ASC,
    v.created_at DESC
LIMIT $7 OFFSET $8;

-- name: CountVideos :one
SELECT COUNT(*) FROM videos
WHERE 
    ($1::uuid IS NULL OR category_id = $1)
    AND ($2::text IS NULL OR processing_status::text = $2)
    AND ($3::uuid IS NULL OR uploaded_by = $3)
    AND (
        $4::text IS NULL OR $4 = '' OR
        LOWER(title) LIKE '%' || LOWER($4) || '%' OR
        LOWER(description) LIKE '%' || LOWER($4) || '%'
    );

-- name: IncrementViewCount :one
UPDATE videos SET view_count = view_count + 1
WHERE id = $1
RETURNING view_count;

-- name: GetVideoWithUploader :one
SELECT 
    v.*,
    u.username as uploader_username,
    c.name as category_name,
    c.slug as category_slug
FROM videos v
JOIN users u ON v.uploaded_by = u.id
LEFT JOIN categories c ON v.category_id = c.id
WHERE v.short_id = $1;

-- name: CountUserVideos :one
SELECT COUNT(*) FROM videos WHERE uploaded_by = $1;

-- name: ListVideosWithoutHLS :many
SELECT * FROM videos
WHERE processing_status = 'completed'
AND filename NOT LIKE '%/master.m3u8'
ORDER BY created_at ASC;

-- name: VideoExistsByShortID :one
SELECT EXISTS(SELECT 1 FROM videos WHERE short_id = $1);

-- name: ListVideosWithAccess :many
-- Non-admin: only COMPLETED videos OR own videos
-- Admin: all videos (is_admin = true)
-- Note: UUID filters check for both NULL and zero UUID (00000000-0000-0000-0000-000000000000)
-- because sqlc generates non-nullable UUID types with zero value when param is empty
SELECT 
    v.*,
    u.username as uploader_username,
    c.name as category_name,
    c.slug as category_slug
FROM videos v
JOIN users u ON v.uploaded_by = u.id
LEFT JOIN categories c ON v.category_id = c.id
WHERE 
    -- Access control: admin sees all, others see completed or own
    ($1::bool = true OR v.processing_status = 'completed' OR v.uploaded_by = $2)
    -- Filters (all optional - check for NULL or zero UUID)
    AND ($3::uuid IS NULL OR $3 = '00000000-0000-0000-0000-000000000000' OR v.category_id = $3)
    AND ($4::text IS NULL OR $4 = '' OR v.processing_status::text = $4)
    AND ($5::uuid IS NULL OR $5 = '00000000-0000-0000-0000-000000000000' OR v.uploaded_by = $5)
    AND ($6::text IS NULL OR $6 = '' OR LOWER(v.title) LIKE '%' || LOWER($6) || '%')
ORDER BY
    CASE WHEN $7 = 'created_at' AND $8 = 'desc' THEN v.created_at END DESC,
    CASE WHEN $7 = 'created_at' AND $8 = 'asc' THEN v.created_at END ASC,
    CASE WHEN $7 = 'title' AND $8 = 'desc' THEN v.title END DESC,
    CASE WHEN $7 = 'title' AND $8 = 'asc' THEN v.title END ASC,
    CASE WHEN $7 = 'view_count' AND $8 = 'desc' THEN v.view_count END DESC,
    CASE WHEN $7 = 'view_count' AND $8 = 'asc' THEN v.view_count END ASC,
    v.created_at DESC
LIMIT $9 OFFSET $10;

-- name: CountVideosWithAccess :one
SELECT COUNT(*) FROM videos v
WHERE 
    ($1::bool = true OR v.processing_status = 'completed' OR v.uploaded_by = $2)
    AND ($3::uuid IS NULL OR $3 = '00000000-0000-0000-0000-000000000000' OR v.category_id = $3)
    AND ($4::text IS NULL OR $4 = '' OR v.processing_status::text = $4)
    AND ($5::uuid IS NULL OR $5 = '00000000-0000-0000-0000-000000000000' OR v.uploaded_by = $5)
    AND ($6::text IS NULL OR $6 = '' OR LOWER(v.title) LIKE '%' || LOWER($6) || '%');

-- name: GetVideoByShortIDWithUploader :one
-- Get video with uploader and category info (no access control - handler checks access)
SELECT 
    v.*,
    u.username as uploader_username,
    c.name as category_name,
    c.slug as category_slug
FROM videos v
JOIN users u ON v.uploaded_by = u.id
LEFT JOIN categories c ON v.category_id = c.id
WHERE v.short_id = $1;

-- name: GetVideoByIDWithUploader :one
-- Get video by UUID with uploader and category info
SELECT 
    v.*,
    u.username as uploader_username,
    c.name as category_name,
    c.slug as category_slug
FROM videos v
JOIN users u ON v.uploaded_by = u.id
LEFT JOIN categories c ON v.category_id = c.id
WHERE v.id = $1;

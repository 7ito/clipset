-- name: GetCommentByID :one
SELECT * FROM comments WHERE id = $1;

-- name: CreateComment :one
INSERT INTO comments (
    video_id, user_id, content, timestamp_seconds, parent_id
) VALUES (
    $1, $2, $3, $4, $5
) RETURNING *;

-- name: UpdateComment :one
UPDATE comments SET
    content = $2,
    updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: DeleteComment :exec
DELETE FROM comments WHERE id = $1;

-- name: ListCommentsByVideo :many
SELECT 
    c.*,
    u.username as author_username,
    u.avatar_filename as author_avatar,
    (SELECT COUNT(*) FROM comments r WHERE r.parent_id = c.id) as reply_count
FROM comments c
JOIN users u ON c.user_id = u.id
WHERE c.video_id = $1 AND c.parent_id IS NULL
ORDER BY
    CASE WHEN $2 = 'newest' THEN c.created_at END DESC,
    CASE WHEN $2 = 'oldest' THEN c.created_at END ASC,
    CASE WHEN $2 = 'timestamp' THEN c.timestamp_seconds END ASC NULLS LAST,
    c.created_at DESC
LIMIT $3 OFFSET $4;

-- name: ListRepliesByComment :many
SELECT 
    c.*,
    u.username as author_username,
    u.avatar_filename as author_avatar
FROM comments c
JOIN users u ON c.user_id = u.id
WHERE c.parent_id = $1
ORDER BY c.created_at ASC;

-- name: CountCommentsByVideo :one
SELECT COUNT(*) FROM comments WHERE video_id = $1 AND parent_id IS NULL;

-- name: GetCommentMarkers :many
SELECT 
    timestamp_seconds,
    COUNT(*) as count
FROM comments
WHERE video_id = $1 AND timestamp_seconds IS NOT NULL
GROUP BY timestamp_seconds
ORDER BY timestamp_seconds ASC;

-- name: GetCommentWithAuthor :one
SELECT 
    c.*,
    u.username as author_username,
    u.avatar_filename as author_avatar,
    v.uploaded_by as video_owner_id
FROM comments c
JOIN users u ON c.user_id = u.id
JOIN videos v ON c.video_id = v.id
WHERE c.id = $1;

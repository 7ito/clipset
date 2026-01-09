-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE LOWER(email) = LOWER($1);

-- name: GetUserByUsername :one
SELECT * FROM users WHERE LOWER(username) = LOWER($1);

-- name: CreateUser :one
INSERT INTO users (
    email, username, password_hash, role
) VALUES (
    @email, @username, @password_hash, @role
) RETURNING *;

-- name: UpdateUser :one
UPDATE users SET
    email = COALESCE(NULLIF($2, ''), email),
    username = COALESCE(NULLIF($3, ''), username),
    avatar_filename = $4,
    is_active = COALESCE($5, is_active)
WHERE id = $1
RETURNING *;

-- name: UpdateUserAvatar :one
UPDATE users SET avatar_filename = $2
WHERE id = $1
RETURNING *;

-- name: DeleteUserAvatar :one
UPDATE users SET avatar_filename = NULL
WHERE id = $1
RETURNING *;

-- name: DeactivateUser :exec
UPDATE users SET is_active = FALSE WHERE id = $1;

-- name: ActivateUser :exec
UPDATE users SET is_active = TRUE WHERE id = $1;

-- name: ListUsers :many
SELECT * FROM users
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: ListUsersDirectory :many
SELECT 
    u.*,
    COUNT(DISTINCT v.id) as video_count,
    COUNT(DISTINCT p.id) as playlist_count
FROM users u
LEFT JOIN videos v ON v.uploaded_by = u.id AND v.processing_status = 'completed'
LEFT JOIN playlists p ON p.created_by = u.id AND p.is_public = TRUE
WHERE u.is_active = TRUE
AND (
    $1::text IS NULL OR $1 = '' OR
    LOWER(u.username) LIKE '%' || LOWER($1) || '%'
)
GROUP BY u.id
ORDER BY
    CASE WHEN $2 = 'newest' THEN u.created_at END DESC,
    CASE WHEN $2 = 'alphabetical' THEN LOWER(u.username) END ASC,
    CASE WHEN $2 = 'videos' THEN COUNT(DISTINCT v.id) END DESC,
    CASE WHEN $2 = 'playlists' THEN COUNT(DISTINCT p.id) END DESC,
    u.created_at DESC;

-- name: CountUsers :one
SELECT COUNT(*) FROM users;

-- name: UpdateUploadQuota :exec
UPDATE users SET 
    weekly_upload_bytes = weekly_upload_bytes + $2
WHERE id = $1;

-- name: ResetUploadQuota :exec
UPDATE users SET 
    weekly_upload_bytes = 0,
    last_upload_reset = NOW()
WHERE id = $1;

-- name: ResetAllUploadQuotas :exec
UPDATE users SET 
    weekly_upload_bytes = 0,
    last_upload_reset = NOW();

-- name: GetUserQuota :one
SELECT weekly_upload_bytes, last_upload_reset FROM users WHERE id = $1;

-- name: UserExistsByEmail :one
SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(email) = LOWER($1));

-- name: UserExistsByUsername :one
SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(username) = LOWER($1));

-- name: CountAdmins :one
SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = TRUE;

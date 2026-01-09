-- name: CreatePasswordResetToken :one
INSERT INTO password_reset_tokens (
    user_id, token_hash, expires_at
) VALUES (
    $1, $2, $3
) RETURNING *;

-- name: GetPasswordResetByHash :one
SELECT * FROM password_reset_tokens WHERE token_hash = $1;

-- name: GetValidPasswordResetByHash :one
SELECT * FROM password_reset_tokens 
WHERE token_hash = $1 AND expires_at > NOW();

-- name: DeletePasswordResetToken :exec
DELETE FROM password_reset_tokens WHERE id = $1;

-- name: DeletePasswordResetTokensByUser :exec
DELETE FROM password_reset_tokens WHERE user_id = $1;

-- name: DeleteExpiredPasswordResetTokens :exec
DELETE FROM password_reset_tokens WHERE expires_at < NOW();

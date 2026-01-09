-- name: GetInvitationByID :one
SELECT * FROM invitations WHERE id = $1;

-- name: GetInvitationByToken :one
SELECT * FROM invitations WHERE token = $1;

-- name: CreateInvitation :one
INSERT INTO invitations (
    email, token, created_by, expires_at
) VALUES (
    LOWER($1), $2, $3, $4
) RETURNING *;

-- name: MarkInvitationUsed :exec
UPDATE invitations SET
    used = TRUE,
    used_at = NOW()
WHERE id = $1;

-- name: DeleteInvitation :exec
DELETE FROM invitations WHERE id = $1;

-- name: ListInvitations :many
SELECT 
    i.*,
    u.username as creator_username
FROM invitations i
JOIN users u ON i.created_by = u.id
ORDER BY i.created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountInvitations :one
SELECT COUNT(*) FROM invitations;

-- name: GetValidInvitationByToken :one
SELECT * FROM invitations 
WHERE token = $1 
AND used = FALSE 
AND expires_at > NOW();

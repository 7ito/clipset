-- name: GetPlaylistByID :one
SELECT * FROM playlists WHERE id = $1;

-- name: GetPlaylistByShortID :one
SELECT * FROM playlists WHERE short_id = $1;

-- name: CreatePlaylist :one
INSERT INTO playlists (
    short_id, name, description, created_by, is_public
) VALUES (
    $1, $2, $3, $4, $5
) RETURNING *;

-- name: UpdatePlaylist :one
UPDATE playlists SET
    name = COALESCE(NULLIF($2, ''), name),
    description = $3,
    is_public = COALESCE($4, is_public),
    updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: DeletePlaylist :exec
DELETE FROM playlists WHERE id = $1;

-- name: ListPlaylistsByUser :many
SELECT 
    p.*,
    u.username as creator_username,
    COUNT(pv.id) as video_count,
    (
        SELECT v.thumbnail_filename 
        FROM playlist_videos pv2 
        JOIN videos v ON v.id = pv2.video_id 
        WHERE pv2.playlist_id = p.id 
        ORDER BY pv2.position ASC 
        LIMIT 1
    ) as first_video_thumbnail
FROM playlists p
JOIN users u ON p.created_by = u.id
LEFT JOIN playlist_videos pv ON pv.playlist_id = p.id
WHERE p.created_by = $1
AND (p.is_public = TRUE OR p.created_by = $2)
GROUP BY p.id, u.username
ORDER BY p.updated_at DESC;

-- name: GetPlaylistWithVideos :one
SELECT 
    p.*,
    u.username as creator_username
FROM playlists p
JOIN users u ON p.created_by = u.id
WHERE p.short_id = $1;

-- name: AddVideoToPlaylist :one
INSERT INTO playlist_videos (
    playlist_id, video_id, position, added_by
) VALUES (
    $1, $2, $3, $4
) RETURNING *;

-- name: RemoveVideoFromPlaylist :exec
DELETE FROM playlist_videos
WHERE playlist_id = $1 AND video_id = $2;

-- name: GetPlaylistVideos :many
SELECT 
    pv.*,
    v.short_id as video_short_id,
    v.title as video_title,
    v.description as video_description,
    v.thumbnail_filename as video_thumbnail,
    v.duration_seconds as video_duration,
    v.view_count as video_view_count,
    v.processing_status as video_status,
    v.created_at as video_created_at,
    vu.username as video_uploader_username
FROM playlist_videos pv
JOIN videos v ON pv.video_id = v.id
JOIN users vu ON v.uploaded_by = vu.id
WHERE pv.playlist_id = $1
ORDER BY pv.position ASC;

-- name: GetMaxPlaylistPosition :one
SELECT COALESCE(MAX(position), -1)::int AS max_position FROM playlist_videos WHERE playlist_id = $1;

-- name: UpdatePlaylistVideoPosition :exec
UPDATE playlist_videos SET position = $3
WHERE playlist_id = $1 AND video_id = $2;

-- name: GetPlaylistsContainingVideo :many
SELECT 
    p.*,
    u.username as creator_username,
    COUNT(pv.id) as video_count
FROM playlists p
JOIN users u ON p.created_by = u.id
JOIN playlist_videos pv ON pv.playlist_id = p.id
WHERE pv.video_id = $1
AND (p.is_public = TRUE OR p.created_by = $2)
GROUP BY p.id, u.username
ORDER BY p.name ASC;

-- name: CountUserPlaylists :one
SELECT COUNT(*) FROM playlists WHERE created_by = $1;

-- name: CountPlaylistVideos :one
SELECT COUNT(*) FROM playlist_videos WHERE playlist_id = $1;

-- name: VideoInPlaylist :one
SELECT EXISTS(
    SELECT 1 FROM playlist_videos WHERE playlist_id = $1 AND video_id = $2
);

-- name: PlaylistExistsByShortID :one
SELECT EXISTS(SELECT 1 FROM playlists WHERE short_id = $1);

-- name: GetPlaylistVideoEntry :one
SELECT * FROM playlist_videos 
WHERE playlist_id = $1 AND video_id = $2;

-- name: DecrementPlaylistPositions :exec
UPDATE playlist_videos 
SET position = position - 1 
WHERE playlist_id = $1 AND position > $2;

-- name: ListUserPlaylistsWithThumbnail :many
SELECT 
    p.*,
    u.username as creator_username,
    COUNT(pv.id) as video_count,
    (
        SELECT v.thumbnail_filename 
        FROM playlist_videos pv2 
        JOIN videos v ON v.id = pv2.video_id 
        WHERE pv2.playlist_id = p.id 
        ORDER BY pv2.position ASC 
        LIMIT 1
    ) as first_video_thumbnail
FROM playlists p
JOIN users u ON p.created_by = u.id
LEFT JOIN playlist_videos pv ON pv.playlist_id = p.id
WHERE p.created_by = $1
GROUP BY p.id, u.username
ORDER BY p.updated_at DESC;

-- name: GetPlaylistsByUsername :many
SELECT 
    p.*,
    u.username as creator_username,
    COUNT(pv.id) as video_count,
    (
        SELECT v.thumbnail_filename 
        FROM playlist_videos pv2 
        JOIN videos v ON v.id = pv2.video_id 
        WHERE pv2.playlist_id = p.id 
        ORDER BY pv2.position ASC 
        LIMIT 1
    ) as first_video_thumbnail
FROM playlists p
JOIN users u ON p.created_by = u.id
LEFT JOIN playlist_videos pv ON pv.playlist_id = p.id
WHERE LOWER(u.username) = LOWER($1)
GROUP BY p.id, u.username
ORDER BY p.updated_at DESC;

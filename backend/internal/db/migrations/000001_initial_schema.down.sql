-- Rollback initial schema

DROP TABLE IF EXISTS config;
DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS playlist_videos;
DROP TABLE IF EXISTS playlists;
DROP TABLE IF EXISTS videos;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS invitations;
DROP TABLE IF EXISTS users;

DROP TYPE IF EXISTS processing_status;
DROP TYPE IF EXISTS user_role;

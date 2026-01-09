-- Clipset Initial Schema
-- This migration creates all tables for the Clipset application

-- Enums
CREATE TYPE user_role AS ENUM ('user', 'admin');
CREATE TYPE processing_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    avatar_filename VARCHAR(255),
    weekly_upload_bytes BIGINT NOT NULL DEFAULT 0,
    last_upload_reset TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_users_email_unique ON users(LOWER(email));
CREATE UNIQUE INDEX idx_users_username_unique ON users(LOWER(username));
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);

-- Invitations
CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at TIMESTAMPTZ
);

CREATE INDEX idx_invitations_email ON invitations(email);
CREATE INDEX idx_invitations_token ON invitations(token);

-- Categories
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    image_filename VARCHAR(255),
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_name ON categories(name);
CREATE INDEX idx_categories_slug ON categories(slug);

-- Videos
CREATE TABLE videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    short_id VARCHAR(10) NOT NULL UNIQUE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    filename VARCHAR(255) NOT NULL UNIQUE,
    thumbnail_filename VARCHAR(255),
    original_filename VARCHAR(255) NOT NULL,
    storage_path VARCHAR(500),
    file_size_bytes BIGINT NOT NULL,
    duration_seconds INTEGER,
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    view_count INTEGER NOT NULL DEFAULT 0,
    processing_status processing_status NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_videos_short_id ON videos(short_id);
CREATE INDEX idx_videos_title ON videos(title);
CREATE INDEX idx_videos_uploaded_by ON videos(uploaded_by);
CREATE INDEX idx_videos_category_id ON videos(category_id);
CREATE INDEX idx_videos_processing_status ON videos(processing_status);
CREATE INDEX idx_videos_created_at ON videos(created_at);

-- Playlists
CREATE TABLE playlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    short_id VARCHAR(10) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_playlists_short_id ON playlists(short_id);
CREATE INDEX idx_playlists_created_by ON playlists(created_by);
CREATE INDEX idx_playlists_is_public ON playlists(is_public);

-- Playlist Videos (junction table)
CREATE TABLE playlist_videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    added_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(playlist_id, video_id)
);

CREATE INDEX idx_playlist_videos_playlist_id ON playlist_videos(playlist_id);
CREATE INDEX idx_playlist_videos_video_id ON playlist_videos(video_id);
CREATE INDEX idx_playlist_videos_position ON playlist_videos(playlist_id, position);

-- Comments (self-referential for replies)
CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    timestamp_seconds INTEGER,
    parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_video_id ON comments(video_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);
CREATE INDEX idx_comments_parent_id ON comments(parent_id);

-- Password Reset Tokens
CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_password_reset_tokens_hash ON password_reset_tokens(token_hash);

-- Config (singleton table)
CREATE TABLE config (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    max_file_size_bytes BIGINT NOT NULL DEFAULT 2147483648,
    weekly_upload_limit_bytes BIGINT NOT NULL DEFAULT 4294967296,
    video_storage_path VARCHAR(500) NOT NULL DEFAULT './data/uploads/videos',
    use_gpu_transcoding BOOLEAN NOT NULL DEFAULT FALSE,
    gpu_device_id INTEGER NOT NULL DEFAULT 0,
    nvenc_preset VARCHAR(10) NOT NULL DEFAULT 'p4',
    nvenc_cq INTEGER NOT NULL DEFAULT 18,
    nvenc_rate_control VARCHAR(20) NOT NULL DEFAULT 'vbr',
    nvenc_max_bitrate VARCHAR(20) NOT NULL DEFAULT '8M',
    nvenc_buffer_size VARCHAR(20) NOT NULL DEFAULT '16M',
    cpu_preset VARCHAR(20) NOT NULL DEFAULT 'medium',
    cpu_crf INTEGER NOT NULL DEFAULT 18,
    max_resolution VARCHAR(10) NOT NULL DEFAULT '1080p',
    audio_bitrate VARCHAR(20) NOT NULL DEFAULT '192k',
    transcode_preset_mode VARCHAR(20) NOT NULL DEFAULT 'balanced',
    video_output_format VARCHAR(20) NOT NULL DEFAULT 'hls',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Insert default config row
INSERT INTO config (id) VALUES (1);

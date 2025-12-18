/**
 * TypeScript types for Playlist entities (Phase 9 feature)
 */

export interface Playlist {
  id: string
  name: string
  description: string | null
  created_by: string
  is_public: boolean
  created_at: string
  updated_at: string
  video_count?: number
}

export interface PlaylistCreate {
  name: string
  description?: string
  is_public?: boolean
}

export interface PlaylistUpdate {
  name?: string
  description?: string
  is_public?: boolean
}

export interface PlaylistVideo {
  id: string
  playlist_id: string
  video_id: string
  position: number
  added_at: string
  added_by: string
}

export interface PlaylistVideoAdd {
  video_id: string
  position?: number
}

export interface PlaylistWithVideos extends Playlist {
  videos: PlaylistVideo[]
}

export interface PlaylistListResponse {
  playlists: Playlist[]
  total: number
}

/**
 * TypeScript types for Playlist entities (Phase 9 feature)
 */

import type { Video } from "./video"

export interface Playlist {
  id: string
  name: string
  description: string | null
  created_by: string
  creator_username: string
  video_count: number
  created_at: string
  updated_at: string
  first_video_thumbnail: string | null
}

export interface PlaylistCreate {
  name: string
  description?: string
}

export interface PlaylistUpdate {
  name?: string
  description?: string
}

export interface PlaylistVideo {
  id: string
  playlist_id: string
  video_id: string
  position: number
  added_at: string
  added_by: string | null
  video: Video
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

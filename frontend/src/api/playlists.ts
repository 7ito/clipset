/**
 * API client for Playlist endpoints
 */

import { apiClient } from "@/lib/api-client"
import { getThumbnailUrl } from "./videos"
import type {
  Playlist,
  PlaylistCreate,
  PlaylistUpdate,
  PlaylistListResponse,
  PlaylistWithVideos,
  PlaylistVideoAdd,
  PlaylistVideoBatchAdd,
  PlaylistVideo,
} from "@/types/playlist"

/**
 * Get all playlists created by a specific user
 */
export const getPlaylistsByUser = async (username: string): Promise<PlaylistListResponse> => {
  const response = await apiClient.get<PlaylistListResponse>(`/api/playlists/by-user/${username}`)
  return response.data
}

/**
 * Create a new playlist
 */
export const createPlaylist = async (data: PlaylistCreate): Promise<Playlist> => {
  const response = await apiClient.post("/api/playlists/", data)
  return response.data
}

/**
 * Get a single playlist with all videos
 */
export const getPlaylist = async (shortId: string): Promise<PlaylistWithVideos> => {
  const response = await apiClient.get<PlaylistWithVideos>(`/api/playlists/${shortId}`)
  return response.data
}

/**
 * Update playlist metadata
 */
export const updatePlaylist = async (shortId: string, data: PlaylistUpdate): Promise<Playlist> => {
  const response = await apiClient.patch<Playlist>(`/api/playlists/${shortId}`, data)
  return response.data
}

/**
 * Delete a playlist
 */
export const deletePlaylist = async (shortId: string): Promise<void> => {
  await apiClient.delete(`/api/playlists/${shortId}`)
}

/**
 * Add a video to a playlist
 */
export const addVideoToPlaylist = async (
  playlistShortId: string,
  videoId: string,
  position?: number
): Promise<void> => {
  const data: PlaylistVideoAdd = {
    video_id: videoId,
    position,
  }
  await apiClient.post(`/api/playlists/${playlistShortId}/videos`, data)
}

/**
 * Add multiple videos to a playlist in a specific order
 * Videos are added in the order provided, appended after existing videos.
 * Videos already in the playlist are skipped.
 */
export const addVideosToPlaylistBatch = async (
  playlistShortId: string,
  videoIds: string[]
): Promise<PlaylistVideo[]> => {
  const data: PlaylistVideoBatchAdd = {
    video_ids: videoIds,
  }
  const response = await apiClient.post<PlaylistVideo[]>(
    `/api/playlists/${playlistShortId}/videos/batch`,
    data
  )
  return response.data
}

/**
 * Remove a video from a playlist
 */
export const removeVideoFromPlaylist = async (
  playlistShortId: string,
  videoId: string
): Promise<void> => {
  await apiClient.delete(`/api/playlists/${playlistShortId}/videos/${videoId}`)
}

/**
 * Reorder videos in a playlist
 */
export const reorderPlaylistVideos = async (
  playlistShortId: string,
  videoPositions: Array<{ video_id: string; position: number }>
): Promise<void> => {
  await apiClient.patch(`/api/playlists/${playlistShortId}/reorder`, {
    video_positions: videoPositions,
  })
}

/**
 * Get all of the current user's playlists
 * Used for the "Add to Playlist" dialog
 */
export const getUserPlaylists = async (videoId: string): Promise<PlaylistListResponse> => {
  const response = await apiClient.get<PlaylistListResponse>(`/api/playlists/videos/${videoId}/playlists`)
  return response.data
}

/**
 * Get thumbnail URL for a video (if available)
 * Helper function for playlist cover images
 */
export const getPlaylistCoverUrl = (playlist: Playlist): string | null => {
  if (playlist.first_video_thumbnail) {
    return getThumbnailUrl(playlist.first_video_thumbnail)
  }
  return null
}

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
} from "@/types/playlist"

/**
 * Get all playlists created by a specific user
 */
export const getPlaylistsByUser = async (username: string): Promise<PlaylistListResponse> => {
  const response = await apiClient.get<PlaylistListResponse>(`/api/playlists/by-user/${username}/`)
  return response.data
}

/**
 * Create a new playlist
 */
export const createPlaylist = async (data: PlaylistCreate): Promise<Playlist> => {
  const response = await apiClient.post<Playlist>("/api/playlists/", data)
  return response.data
}

/**
 * Get a single playlist with all videos
 */
export const getPlaylist = async (id: string): Promise<PlaylistWithVideos> => {
  const response = await apiClient.get<PlaylistWithVideos>(`/api/playlists/${id}/`)
  return response.data
}

/**
 * Update playlist metadata
 */
export const updatePlaylist = async (id: string, data: PlaylistUpdate): Promise<Playlist> => {
  const response = await apiClient.patch<Playlist>(`/api/playlists/${id}/`, data)
  return response.data
}

/**
 * Delete a playlist
 */
export const deletePlaylist = async (id: string): Promise<void> => {
  await apiClient.delete(`/api/playlists/${id}/`)
}

/**
 * Add a video to a playlist
 */
export const addVideoToPlaylist = async (
  playlistId: string,
  videoId: string,
  position?: number
): Promise<void> => {
  const data: PlaylistVideoAdd = {
    video_id: videoId,
    position,
  }
  await apiClient.post(`/api/playlists/${playlistId}/videos/`, data)
}

/**
 * Remove a video from a playlist
 */
export const removeVideoFromPlaylist = async (
  playlistId: string,
  videoId: string
): Promise<void> => {
  await apiClient.delete(`/api/playlists/${playlistId}/videos/${videoId}/`)
}

/**
 * Reorder videos in a playlist
 */
export const reorderPlaylistVideos = async (
  playlistId: string,
  videoPositions: Array<{ video_id: string; position: number }>
): Promise<void> => {
  await apiClient.patch(`/api/playlists/${playlistId}/reorder/`, {
    video_positions: videoPositions,
  })
}

/**
 * Get all of the current user's playlists
 * Used for the "Add to Playlist" dialog
 */
export const getUserPlaylists = async (videoId: string): Promise<PlaylistListResponse> => {
  const response = await apiClient.get<PlaylistListResponse>(`/api/playlists/videos/${videoId}/playlists/`)
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

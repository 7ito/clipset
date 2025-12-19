/**
 * Video API client functions
 */
import { apiClient } from "@/lib/api-client"
import type { Video, VideoUploadRequest, VideoListResponse, QuotaInfo, ProcessingStatus } from "@/types/video"

interface VideoListParams {
  category_id?: string
  status?: ProcessingStatus
  uploaded_by?: string
  search?: string
  skip?: number
  limit?: number
  sort?: string
  order?: "asc" | "desc"
}

/**
 * Upload a video file with metadata
 */
export async function uploadVideo(
  file: File,
  metadata: VideoUploadRequest,
  onProgress?: (percentage: number) => void
): Promise<Video> {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("title", metadata.title)
  
  if (metadata.description) {
    formData.append("description", metadata.description)
  }
  
  if (metadata.category_id) {
    formData.append("category_id", metadata.category_id)
  }
  
  const response = await apiClient.post<Video>("/api/videos/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percentage = Math.round((progressEvent.loaded / progressEvent.total) * 100)
        onProgress(percentage)
      }
    }
  })
  
  return response.data
}

/**
 * Get list of videos with optional filters
 */
export async function getVideos(params?: VideoListParams): Promise<VideoListResponse> {
  const response = await apiClient.get<VideoListResponse>("/api/videos/", { params })
  return response.data
}

/**
 * Get a single video by ID
 */
export async function getVideo(id: string): Promise<Video> {
  const response = await apiClient.get<Video>(`/api/videos/${id}`)
  return response.data
}

/**
 * Update video metadata
 */
export async function updateVideo(
  id: string,
  data: Partial<VideoUploadRequest>
): Promise<Video> {
  const response = await apiClient.patch<Video>(`/api/videos/${id}`, data)
  return response.data
}

/**
 * Delete a video
 */
export async function deleteVideo(id: string): Promise<void> {
  await apiClient.delete(`/api/videos/${id}`)
}

/**
 * Increment video view count
 */
export async function incrementViewCount(id: string): Promise<{ view_count: number }> {
  const response = await apiClient.post<{ view_count: number }>(`/api/videos/${id}/view`)
  return response.data
}

/**
 * Get current user's quota information
 */
export async function getQuotaInfo(): Promise<QuotaInfo> {
  const response = await apiClient.get<QuotaInfo>("/api/videos/quota/me")
  return response.data
}

/**
 * Get video streaming URL
 */
export function getVideoStreamUrl(id: string): string {
  const token = localStorage.getItem("clipset_token")
  const baseUrl = env.apiBaseUrl.endsWith("/") ? env.apiBaseUrl.slice(0, -1) : env.apiBaseUrl
  return `${baseUrl}/api/videos/${id}/stream?token=${token}`
}

import { env } from "@/config/env"

/**
 * Get video thumbnail URL
 * Now served directly by nginx for better performance
 */
export function getThumbnailUrl(filename: string): string {
  // Use absolute URL in development if apiBaseUrl is present
  if (env.apiBaseUrl && env.apiBaseUrl.startsWith("http")) {
    const origin = new URL(env.apiBaseUrl).origin
    return `${origin}/media/thumbnails/${filename}`
  }
  return `/media/thumbnails/${filename}`
}

/**
 * Reset all users' upload quotas (admin only)
 */
export interface QuotaResetResponse {
  reset_count: number
  message: string
}

export async function resetAllQuotas(): Promise<QuotaResetResponse> {
  const response = await apiClient.post<QuotaResetResponse>(
    "/api/videos/admin/quota/reset-all"
  )
  return response.data
}

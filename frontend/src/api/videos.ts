/**
 * Video API client functions
 */
import { apiClient } from "@/lib/api-client"
import type { Video, VideoUploadRequest, VideoListResponse, QuotaInfo, ProcessingStatus } from "@/types/video"

interface ChunkUploadInitResponse {
  upload_id: string
}

interface ChunkUploadCompleteRequest extends VideoUploadRequest {
  upload_id: string
  filename: string
}

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
 * Upload a video file with metadata.
 * Automatically uses chunked upload for files larger than 90MB to bypass Cloudflare limits.
 */
export async function uploadVideo(
  file: File,
  metadata: VideoUploadRequest,
  onProgress?: (percentage: number) => void
): Promise<Video> {
  const CLOUDFLARE_LIMIT = 90 * 1024 * 1024 // 90MB
  const CHUNK_SIZE = 50 * 1024 * 1024 // 50MB

  if (file.size <= CLOUDFLARE_LIMIT) {
    // Normal upload
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
  } else {
    // Chunked upload
    // 1. Initialize
    const initResponse = await apiClient.post<ChunkUploadInitResponse>("/api/videos/upload/init")
    const { upload_id } = initResponse.data

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
    
    // 2. Upload chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE
      const end = Math.min(start + CHUNK_SIZE, file.size)
      const chunk = file.slice(start, end)
      
      const formData = new FormData()
      formData.append("upload_id", upload_id)
      formData.append("chunk_index", i.toString())
      formData.append("file", chunk, file.name)
      
      await apiClient.post("/api/videos/upload/chunk", formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const chunkProgress = progressEvent.loaded / progressEvent.total
            const totalProgress = ((i + chunkProgress) / totalChunks) * 100
            onProgress(Math.round(totalProgress))
          }
        }
      })
    }
    
    // 3. Complete
    const completeRequest: ChunkUploadCompleteRequest = {
      upload_id,
      filename: file.name,
      ...metadata
    }
    
    const response = await apiClient.post<Video>("/api/videos/upload/complete", completeRequest)
    return response.data
  }
}

/**
 * Get list of videos with optional filters
 */
export async function getVideos(params?: VideoListParams): Promise<VideoListResponse> {
  const response = await apiClient.get<VideoListResponse>("/api/videos/", { params })
  return response.data
}

/**
 * Get a single video by short_id
 */
export async function getVideo(shortId: string): Promise<Video> {
  const response = await apiClient.get<Video>(`/api/videos/${shortId}`)
  return response.data
}

/**
 * Update video metadata
 */
export async function updateVideo(
  shortId: string,
  data: Partial<VideoUploadRequest>
): Promise<Video> {
  const response = await apiClient.patch<Video>(`/api/videos/${shortId}`, data)
  return response.data
}

/**
 * Delete a video
 */
export async function deleteVideo(shortId: string): Promise<void> {
  await apiClient.delete(`/api/videos/${shortId}`)
}

/**
 * Increment video view count
 */
export async function incrementViewCount(shortId: string): Promise<{ view_count: number }> {
  const response = await apiClient.post<{ view_count: number }>(`/api/videos/${shortId}/view`)
  return response.data
}

/**
 * Get current user's quota information
 */
export async function getQuotaInfo(): Promise<QuotaInfo> {
  const response = await apiClient.get<QuotaInfo>("/api/videos/quota/me")
  return response.data
}

import { env } from "@/config/env"

/**
 * Stream info response from the API
 */
export interface StreamInfo {
  format: "hls" | "progressive" | "unknown"
  manifest_url?: string  // For HLS
  stream_url?: string    // For progressive
  ready: boolean
  processing_status?: string
}

/**
 * Get stream info to determine how to play the video
 */
export async function getStreamInfo(shortId: string): Promise<StreamInfo> {
  const response = await apiClient.get<StreamInfo>(`/api/videos/${shortId}/stream-info`)
  return response.data
}

/**
 * Get video streaming URL (progressive MP4)
 */
export function getVideoStreamUrl(shortId: string): string {
  const token = localStorage.getItem("clipset_token")
  const baseUrl = env.apiBaseUrl.endsWith("/") ? env.apiBaseUrl.slice(0, -1) : env.apiBaseUrl
  return `${baseUrl}/api/videos/${shortId}/stream?token=${token}`
}

/**
 * Get HLS manifest URL
 */
export function getHlsManifestUrl(shortId: string): string {
  const token = localStorage.getItem("clipset_token")
  const baseUrl = env.apiBaseUrl.endsWith("/") ? env.apiBaseUrl.slice(0, -1) : env.apiBaseUrl
  return `${baseUrl}/api/videos/${shortId}/hls/master.m3u8?token=${token}`
}

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

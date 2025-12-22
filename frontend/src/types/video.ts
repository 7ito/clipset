/**
 * Video-related TypeScript types
 */

export const ProcessingStatus = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed"
} as const

export type ProcessingStatus = typeof ProcessingStatus[keyof typeof ProcessingStatus]

export interface Video {
  id: string
  title: string
  description: string | null
  filename: string
  thumbnail_filename: string | null
  original_filename: string
  file_size_bytes: number
  duration_seconds: number | null
  uploaded_by: string
  category_id: string | null
  view_count: number
  processing_status: ProcessingStatus
  error_message: string | null
  created_at: string
  uploader_username: string
  category_name: string | null
  category_slug: string | null
}

export interface QuotaInfo {
  used_bytes: number
  limit_bytes: number
  remaining_bytes: number
  percentage_used: number
  can_upload: boolean
  max_file_size_bytes: number
}

export interface VideoUploadRequest {
  title: string
  description?: string
  category_id?: string
}

export interface VideoListResponse {
  videos: Video[]
  total: number
}

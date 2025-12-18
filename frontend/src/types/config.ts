/**
 * System configuration types
 */

export interface SystemConfig {
  // Upload & Storage Settings
  max_file_size_bytes: number
  weekly_upload_limit_bytes: number
  video_storage_path: string

  // Metadata
  updated_at: string
  updated_by?: string
}

export interface ConfigUpdate {
  max_file_size_bytes?: number
  weekly_upload_limit_bytes?: number
  video_storage_path?: string
}

export interface UserBase {
  email: string
  username: string
}

export interface UserResponse extends UserBase {
  id: string
  role: string
  created_at: string
  is_active: boolean
  video_count: number
  playlist_count: number
}

export interface UserWithQuota extends UserResponse {
  weekly_upload_bytes: number
  last_upload_reset: string
}

export interface UserProfile {
  id: string
  username: string
  created_at: string
  video_count: number
  playlist_count: number
}

export interface UserDirectoryResponse {
  id: string
  username: string
  video_count: number
  playlist_count: number
}

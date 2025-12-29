export interface Comment {
  id: string
  video_id: string
  content: string
  timestamp_seconds: number | null
  parent_id: string | null
  user_id: string
  author_username: string
  author_avatar_url: string | null
  created_at: string
  updated_at: string
  
  // Computed fields from backend
  is_edited: boolean
  can_edit: boolean
  can_delete: boolean
  reply_count: number
  replies?: Comment[]
}

export interface CommentCreate {
  content: string
  timestamp_seconds?: number
  parent_id?: string
}

export interface CommentUpdate {
  content: string
}

export interface CommentMarker {
  seconds: number
  count: number
}

export interface CommentListResponse {
  comments: Comment[]
  total: number
  has_more: boolean
}

import { apiClient } from "@/lib/api-client"
import type { 
  Comment, 
  CommentCreate, 
  CommentUpdate, 
  CommentMarker, 
  CommentListResponse 
} from "@/types/comment"

/**
 * Get top-level comments for a video with their replies.
 */
export async function getVideoComments(
  videoId: string,
  options?: { skip?: number; limit?: number; sort?: "newest" | "oldest" | "timestamp" }
): Promise<CommentListResponse> {
  const params = new URLSearchParams()
  if (options?.skip !== undefined) params.set("skip", options.skip.toString())
  if (options?.limit !== undefined) params.set("limit", options.limit.toString())
  if (options?.sort) params.set("sort", options.sort)

  const response = await apiClient.get<CommentListResponse>(`/api/videos/${videoId}/comments?${params.toString()}`)
  return response.data
}

/**
 * Create a new comment or reply.
 */
export async function createComment(
  videoId: string,
  data: CommentCreate
): Promise<Comment> {
  const response = await apiClient.post<Comment>(`/api/videos/${videoId}/comments`, data)
  return response.data
}

/**
 * Update an existing comment.
 */
export async function updateComment(
  commentId: string,
  data: CommentUpdate
): Promise<Comment> {
  const response = await apiClient.patch<Comment>(`/api/comments/${commentId}`, data)
  return response.data
}

/**
 * Delete a comment.
 */
export async function deleteComment(commentId: string): Promise<void> {
  await apiClient.delete(`/api/comments/${commentId}`)
}

/**
 * Get comment markers for the video progress bar.
 */
export async function getCommentMarkers(
  videoId: string
): Promise<CommentMarker[]> {
  const response = await apiClient.get<CommentMarker[]>(`/api/videos/${videoId}/comment-markers`)
  return response.data
}

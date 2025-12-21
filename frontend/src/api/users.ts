import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import type { UserResponse, UserProfile, UserWithQuota, UserDirectoryResponse } from "@/types/user"
import type { PaginationParams } from "@/types/api"

export interface UserDirectoryParams {
  search?: string
  sort?: string
}

export function useUsers(params: PaginationParams = {}) {
  return useQuery({
    queryKey: ["users", params],
    queryFn: async () => {
      const response = await apiClient.get<UserResponse[]>("/api/users/", { params })
      return response.data
    }
  })
}

export function useUserDirectory(params: UserDirectoryParams = {}) {
  return useQuery({
    queryKey: ["users-directory", params],
    queryFn: async () => {
      const response = await apiClient.get<UserDirectoryResponse[]>("/api/users/directory", { params })
      return response.data
    }
  })
}

export function useUser(userId: string) {
  return useQuery({
    queryKey: ["user", userId],
    queryFn: async () => {
      const response = await apiClient.get<UserProfile | UserWithQuota>(`/api/users/${userId}`)
      return response.data
    }
  })
}

export function useDeactivateUser() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiClient.delete<{ message: string }>(`/api/users/${userId}`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] })
      queryClient.invalidateQueries({ queryKey: ["users-directory"] })
    }
  })
}

export function useActivateUser() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiClient.post<{ message: string }>(`/api/users/${userId}/activate`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] })
      queryClient.invalidateQueries({ queryKey: ["users-directory"] })
    }
  })
}

export function useUploadAvatar() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append("file", file)
      const response = await apiClient.post<UserWithQuota>("/api/users/me/avatar", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      })
      return response.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["auth-user"], data)
      queryClient.invalidateQueries({ queryKey: ["user", data.id] })
      queryClient.invalidateQueries({ queryKey: ["users"] })
      queryClient.invalidateQueries({ queryKey: ["users-directory"] })
    }
  })
}

export function useDeleteAvatar() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.delete<UserWithQuota>("/api/users/me/avatar")
      return response.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["auth-user"], data)
      queryClient.invalidateQueries({ queryKey: ["user", data.id] })
      queryClient.invalidateQueries({ queryKey: ["users"] })
      queryClient.invalidateQueries({ queryKey: ["users-directory"] })
    }
  })
}

export async function getUserByUsername(username: string): Promise<UserProfile | UserWithQuota> {
  const response = await apiClient.get<UserProfile | UserWithQuota>(
    `/api/users/by-username/${username.toLowerCase()}`
  )
  return response.data
}

export interface AdminStats {
  totalUsers: number
  totalVideos: number
  videosByStatus: {
    completed: number
    processing: number
    pending: number
    failed: number
  }
  totalStorageBytes: number
}

export async function getAdminStats(): Promise<AdminStats> {
  // Fetch users (limit to reasonable number for small communities)
  const usersResponse = await apiClient.get<UserResponse[]>("/api/users/", {
    params: { skip: 0, limit: 500 }
  })
  
  // Fetch videos (limit to reasonable number)
  const videosResponse = await apiClient.get<{
    videos: Array<{ processing_status: string; file_size_bytes: number }>
    total: number
  }>("/api/videos/", {
    params: { skip: 0, limit: 1000 }
  })
  
  // Aggregate video stats
  const videosByStatus = {
    completed: 0,
    processing: 0,
    pending: 0,
    failed: 0
  }
  
  let totalStorageBytes = 0
  
  videosResponse.data.videos.forEach(video => {
    const status = video.processing_status as keyof typeof videosByStatus
    if (status in videosByStatus) {
      videosByStatus[status]++
    }
    totalStorageBytes += video.file_size_bytes
  })
  
  return {
    totalUsers: usersResponse.data.length,
    totalVideos: videosResponse.data.total,
    videosByStatus,
    totalStorageBytes
  }
}

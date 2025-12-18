import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import type { UserResponse, UserProfile, UserWithQuota } from "@/types/user"
import type { PaginationParams } from "@/types/api"

export function useUsers(params: PaginationParams = {}) {
  return useQuery({
    queryKey: ["users", params],
    queryFn: async () => {
      const response = await apiClient.get<UserResponse[]>("/api/users", { params })
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
    }
  })
}

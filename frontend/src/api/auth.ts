import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { setToken, removeToken, getToken } from "@/lib/auth"
import type { LoginRequest, RegisterRequest, TokenResponse } from "@/types/auth"
import type { UserWithQuota } from "@/types/user"

export function useLogin() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: LoginRequest) => {
      const response = await apiClient.post<TokenResponse>("/api/auth/login", data)
      return response.data
    },
    onSuccess: (data) => {
      setToken(data.access_token)
      // Invalidate current user query to fetch fresh user data
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
    }
  })
}

export function useRegister() {
  return useMutation({
    mutationFn: async (data: RegisterRequest) => {
      const response = await apiClient.post<UserWithQuota>("/api/auth/register", data)
      return response.data
    }
  })
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ["currentUser"],
    queryFn: async () => {
      const response = await apiClient.get<UserWithQuota>("/api/auth/me")
      return response.data
    },
    enabled: !!getToken(),
    retry: false,
    staleTime: 1000 * 60 * 5 // 5 minutes
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async () => {
      // No API call needed for logout, just clear local state
      removeToken()
    },
    onSuccess: () => {
      // Clear all queries
      queryClient.clear()
    }
  })
}

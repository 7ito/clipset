import axios, { AxiosError } from "axios"
import { env } from "@/config/env"
import { getToken, removeToken } from "@/lib/auth"
import type { ApiError } from "@/types/api"

export const apiClient = axios.create({
  baseURL: env.apiBaseUrl,
  headers: {
    "Content-Type": "application/json"
  }
})

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    // Handle 401 Unauthorized - clear token and redirect to login
    if (error.response?.status === 401) {
      removeToken()
      // Only redirect if not already on login or register page
      if (!window.location.pathname.startsWith("/login") && !window.location.pathname.startsWith("/register")) {
        window.location.href = "/login"
      }
    }
    
    return Promise.reject(error)
  }
)

// Helper to extract error message from API error
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const apiError = error.response?.data as ApiError | undefined
    return apiError?.detail || error.message || "An unexpected error occurred"
  }
  
  if (error instanceof Error) {
    return error.message
  }
  
  return "An unexpected error occurred"
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import type {
  InvitationCreate,
  InvitationResponse,
  InvitationWithLink,
  InvitationValidation
} from "@/types/invitation"
import type { PaginationParams } from "@/types/api"

export function useCreateInvitation() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: InvitationCreate) => {
      const response = await apiClient.post<InvitationWithLink>("/api/invitations/", data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations"] })
    }
  })
}

export function useInvitations(params: PaginationParams = {}) {
  return useQuery({
    queryKey: ["invitations", params],
    queryFn: async () => {
      const response = await apiClient.get<InvitationResponse[]>("/api/invitations/", { 
        params: {
          skip: params.skip ?? (params.page ? (params.page - 1) * (params.page_size ?? 10) : 0),
          limit: params.limit ?? params.page_size ?? 10
        }
      })
      return response.data
    }
  })
}

export function useValidateInvitation(token: string) {
  return useQuery({
    queryKey: ["invitationValidation", token],
    queryFn: async () => {
      const response = await apiClient.get<InvitationValidation>(`/api/invitations/validate/${token}/`)
      return response.data
    },
    enabled: !!token,
    retry: false
  })
}

export function useRevokeInvitation() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const response = await apiClient.delete<{ message: string }>(`/api/invitations/${invitationId}/`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations"] })
    }
  })
}

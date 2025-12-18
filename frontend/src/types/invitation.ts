export interface InvitationCreate {
  email: string
}

export interface InvitationResponse {
  id: string
  email: string
  token: string
  created_by: string
  created_at: string
  expires_at: string
  used: boolean
  used_at: string | null
}

export interface InvitationWithLink extends InvitationResponse {
  invitation_link: string
}

export interface InvitationValidation {
  valid: boolean
  email?: string
  message?: string
}

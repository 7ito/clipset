import type { InvitationResponse } from "@/types/invitation"

export type InvitationStatus = "Pending" | "Used" | "Expired"
export type StatusVariant = "default" | "secondary" | "destructive"

export function formatInvitationStatus(invitation: InvitationResponse): InvitationStatus {
  if (invitation.used) return "Used"
  if (new Date(invitation.expires_at) < new Date()) return "Expired"
  return "Pending"
}

export function getStatusBadgeVariant(invitation: InvitationResponse): StatusVariant {
  const status = formatInvitationStatus(invitation)
  
  switch (status) {
    case "Used":
      return "secondary"
    case "Expired":
      return "destructive"
    default:
      return "default"
  }
}

export function formatInvitationDate(date: string): string {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function formatExpirationTime(expiresAt: string): string {
  const now = new Date()
  const expires = new Date(expiresAt)
  const diffMs = expires.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays > 0) {
    return `Expires in ${diffDays} ${diffDays === 1 ? "day" : "days"}`
  } else {
    const expiredDays = Math.abs(diffDays)
    return `Expired ${expiredDays} ${expiredDays === 1 ? "day" : "days"} ago`
  }
}

export function buildInvitationLink(token: string): string {
  return `${window.location.origin}/register/${token}`
}

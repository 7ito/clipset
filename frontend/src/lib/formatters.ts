/**
 * Safely parse a date string, ensuring it's treated as UTC if no timezone is provided
 */
export function parseDate(dateString: string): Date {
  if (!dateString) return new Date()
  
  // If string doesn't end with Z or a timezone offset like +HH:MM or -HH:MM
  // and it's in ISO-like format, append Z to force UTC interpretation
  let sanitized = dateString
  if (!dateString.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(dateString)) {
    sanitized = dateString.includes("T") ? `${dateString}Z` : `${dateString}T00:00:00Z`
  }
  
  return new Date(sanitized)
}

export function formatDate(dateString: string): string {
  const date = parseDate(dateString)
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date)
}

export function formatDateShort(dateString: string): string {
  const date = parseDate(dateString)
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date)
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes"
  
  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i]
}

export function formatRelativeTime(dateString: string): string {
  const date = parseDate(dateString)
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  
  if (seconds < 60) return "just now"
  
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`
  }
  
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600)
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`
  }
  
  if (seconds < 2592000) {
    const days = Math.floor(seconds / 86400)
    return `${days} ${days === 1 ? "day" : "days"} ago`
  }
  
  if (seconds < 31536000) {
    const months = Math.floor(seconds / 2592000)
    return `${months} ${months === 1 ? "month" : "months"} ago`
  }
  
  const years = Math.floor(seconds / 31536000)
  return `${years} ${years === 1 ? "year" : "years"} ago`
}

/**
 * Format duration in seconds to MM:SS or HH:MM:SS
 */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "Processing..."
  
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }
  
  return `${minutes}:${secs.toString().padStart(2, "0")}`
}

/**
 * Format file size in bytes to human-readable string
 */
export function formatFileSize(bytes: number): string {
  return formatBytes(bytes)
}

/**
 * Format upload date - relative for recent, absolute for older
 */
export function formatUploadDate(dateString: string): string {
  const date = parseDate(dateString)
  const now = new Date()
  const daysDiff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  
  if (daysDiff < 7) {
    return formatRelativeTime(dateString)
  }
  
  return formatDateShort(dateString)
}

/**
 * Get status color for badge styling
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case "completed":
      return "green"
    case "processing":
      return "blue"
    case "pending":
      return "yellow"
    case "failed":
      return "red"
    default:
      return "gray"
  }
}

/**
 * Timestamp utilities for video player and comments
 */

/**
 * Parse a timestamp string into seconds
 * Supports formats:
 * - "120" (seconds)
 * - "2:30" (mm:ss)
 * - "1:23:45" (hh:mm:ss)
 * - "2m30s" (shorthand)
 * - "1h23m45s" (shorthand)
 * - "30s" (seconds shorthand)
 */
export function parseTimestamp(str: string): number | null {
  if (!str || typeof str !== "string") return null
  
  const trimmed = str.trim().toLowerCase()
  
  // Try pure number (seconds)
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10)
  }
  
  // Try shorthand format: 1h23m45s, 2m30s, 30s
  const shorthandMatch = trimmed.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (shorthandMatch && (shorthandMatch[1] || shorthandMatch[2] || shorthandMatch[3])) {
    const hours = parseInt(shorthandMatch[1] || "0", 10)
    const minutes = parseInt(shorthandMatch[2] || "0", 10)
    const seconds = parseInt(shorthandMatch[3] || "0", 10)
    return hours * 3600 + minutes * 60 + seconds
  }
  
  // Try colon format: 1:23:45, 2:30
  const colonMatch = trimmed.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/)
  if (colonMatch) {
    if (colonMatch[3] !== undefined) {
      // hh:mm:ss format
      const hours = parseInt(colonMatch[1], 10)
      const minutes = parseInt(colonMatch[2], 10)
      const seconds = parseInt(colonMatch[3], 10)
      if (minutes < 60 && seconds < 60) {
        return hours * 3600 + minutes * 60 + seconds
      }
    } else {
      // mm:ss format
      const minutes = parseInt(colonMatch[1], 10)
      const seconds = parseInt(colonMatch[2], 10)
      if (seconds < 60) {
        return minutes * 60 + seconds
      }
    }
  }
  
  return null
}

/**
 * Format seconds to a human-readable timestamp string
 * Returns "0:00", "2:30", "1:23:45" format
 */
export function formatTimestamp(seconds: number): string {
  if (seconds < 0 || !Number.isFinite(seconds)) return "0:00"
  
  const totalSeconds = Math.floor(seconds)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }
  
  return `${minutes}:${secs.toString().padStart(2, "0")}`
}

/**
 * Format seconds to shorthand format (e.g., "2m30s", "1h23m")
 */
export function formatTimestampShorthand(seconds: number): string {
  if (seconds < 0 || !Number.isFinite(seconds)) return "0s"
  
  const totalSeconds = Math.floor(seconds)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60
  
  let result = ""
  if (hours > 0) result += `${hours}h`
  if (minutes > 0) result += `${minutes}m`
  if (secs > 0 || result === "") result += `${secs}s`
  
  return result
}

/**
 * Create a URL with timestamp parameter
 */
export function formatTimestampUrl(baseUrl: string, seconds: number): string {
  const url = new URL(baseUrl)
  url.searchParams.set("t", Math.floor(seconds).toString())
  return url.toString()
}

/**
 * Extract timestamp from URL search params
 */
export function parseTimestampFromUrl(url: string | URL): number | null {
  try {
    const urlObj = typeof url === "string" ? new URL(url) : url
    const t = urlObj.searchParams.get("t")
    if (t) {
      return parseTimestamp(t)
    }
  } catch {
    // Invalid URL
  }
  return null
}

/**
 * Regex pattern to match timestamps in text
 * Matches: 0:30, 2:30, 1:23:45, 30s, 2m30s, 1h23m45s
 * Also matches with @ or "at" prefix
 */
export const TIMESTAMP_REGEX = /(?:@\s*|at\s+)?(\d{1,2}:\d{2}(?::\d{2})?|\d+[hms](?:\d+[ms])?(?:\d+s)?)/gi

/**
 * Find all timestamps in a text string
 * Returns array of { match, seconds, start, end }
 */
export function findTimestampsInText(text: string): Array<{
  match: string
  seconds: number
  start: number
  end: number
}> {
  const results: Array<{ match: string; seconds: number; start: number; end: number }> = []
  
  // Reset regex state
  TIMESTAMP_REGEX.lastIndex = 0
  
  let match
  while ((match = TIMESTAMP_REGEX.exec(text)) !== null) {
    const timestamp = match[1]
    const seconds = parseTimestamp(timestamp)
    
    if (seconds !== null) {
      results.push({
        match: match[0],
        seconds,
        start: match.index,
        end: match.index + match[0].length
      })
    }
  }
  
  return results
}

/**
 * Clamp a timestamp to valid video bounds
 */
export function clampTimestamp(seconds: number, duration: number): number {
  return Math.max(0, Math.min(seconds, duration))
}

/**
 * Calculate percentage position of timestamp in video
 */
export function timestampToPercent(seconds: number, duration: number): number {
  if (duration <= 0) return 0
  return (seconds / duration) * 100
}

/**
 * Calculate seconds from percentage position
 */
export function percentToTimestamp(percent: number, duration: number): number {
  return (percent / 100) * duration
}

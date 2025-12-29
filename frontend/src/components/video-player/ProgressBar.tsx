import { useRef, useState, useCallback } from "react"
import { formatTimestamp } from "@/lib/timestamps"

interface ProgressBarProps {
  currentTime: number
  duration: number
  buffered: TimeRanges | null
  onSeek: (time: number) => void
  onSeekStart?: () => void
  onSeekEnd?: () => void
}

export function ProgressBar({
  currentTime,
  duration,
  buffered,
  onSeek,
  onSeekStart,
  onSeekEnd
}: ProgressBarProps) {
  const progressRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [hoverPosition, setHoverPosition] = useState(0)

  const calculateTimeFromPosition = useCallback((clientX: number): number => {
    if (!progressRef.current || !duration) return 0
    const rect = progressRef.current.getBoundingClientRect()
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return percent * duration
  }, [duration])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!progressRef.current) return
    const rect = progressRef.current.getBoundingClientRect()
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setHoverPosition(percent * 100)
    setHoverTime(percent * duration)

    if (isDragging) {
      onSeek(percent * duration)
    }
  }, [duration, isDragging, onSeek])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    onSeekStart?.()
    const time = calculateTimeFromPosition(e.clientX)
    onSeek(time)

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const time = calculateTimeFromPosition(e.clientX)
      onSeek(time)
    }

    const handleGlobalMouseUp = () => {
      setIsDragging(false)
      onSeekEnd?.()
      document.removeEventListener("mousemove", handleGlobalMouseMove)
      document.removeEventListener("mouseup", handleGlobalMouseUp)
    }

    document.addEventListener("mousemove", handleGlobalMouseMove)
    document.addEventListener("mouseup", handleGlobalMouseUp)
  }, [calculateTimeFromPosition, onSeek, onSeekStart, onSeekEnd])

  const handleMouseLeave = useCallback(() => {
    if (!isDragging) {
      setHoverTime(null)
    }
  }, [isDragging])

  // Touch handlers for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    setIsDragging(true)
    onSeekStart?.()
    const time = calculateTimeFromPosition(e.touches[0].clientX)
    onSeek(time)
  }, [calculateTimeFromPosition, onSeek, onSeekStart])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return
    const time = calculateTimeFromPosition(e.touches[0].clientX)
    onSeek(time)
  }, [isDragging, calculateTimeFromPosition, onSeek])

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false)
    onSeekEnd?.()
  }, [onSeekEnd])

  // Calculate progress percentage
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  // Calculate buffered ranges
  const getBufferedPercent = (): number => {
    if (!buffered || buffered.length === 0 || !duration) return 0
    // Find the buffered range that includes current time
    for (let i = 0; i < buffered.length; i++) {
      if (buffered.start(i) <= currentTime && buffered.end(i) >= currentTime) {
        return (buffered.end(i) / duration) * 100
      }
    }
    // Otherwise return the end of the last buffered range before current time
    for (let i = buffered.length - 1; i >= 0; i--) {
      if (buffered.end(i) <= currentTime) {
        return (buffered.end(i) / duration) * 100
      }
    }
    return 0
  }

  const bufferedPercent = getBufferedPercent()

  return (
    <div className="video-progress-container group/progress">
      {/* Time preview tooltip */}
      {hoverTime !== null && (
        <div
          className="video-progress-tooltip"
          style={{ left: `${hoverPosition}%` }}
        >
          {formatTimestamp(hoverTime)}
        </div>
      )}

      <div
        ref={progressRef}
        className="video-progress-bar"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Background track */}
        <div className="video-progress-track" />

        {/* Buffered progress */}
        <div
          className="video-progress-buffered"
          style={{ width: `${bufferedPercent}%` }}
        />

        {/* Played progress */}
        <div
          className="video-progress-played"
          style={{ width: `${progressPercent}%` }}
        />

        {/* Hover preview line */}
        {hoverTime !== null && (
          <div
            className="video-progress-hover"
            style={{ width: `${hoverPosition}%` }}
          />
        )}

        {/* Scrubber handle */}
        <div
          className="video-progress-handle"
          style={{ left: `${progressPercent}%` }}
        />
      </div>
    </div>
  )
}

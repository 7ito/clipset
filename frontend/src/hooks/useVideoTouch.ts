import { useState, useCallback, useRef } from "react"
import type { VideoControls } from "./useVideoPlayer"

export interface DoubleTapState {
  side: "left" | "right" | null
  visible: boolean
  amount: number
}

export interface UseVideoTouchOptions {
  enabled?: boolean
  controls: VideoControls
  skipAmount?: number
  doubleTapTimeout?: number
}

/**
 * Hook to handle mobile touch interactions for video player
 * 
 * Features:
 * - Double-tap left third: Skip back 5 seconds
 * - Double-tap right third: Skip forward 5 seconds
 * - Single tap center: Toggle play/pause (handled by controls overlay)
 */
export function useVideoTouch(options: UseVideoTouchOptions) {
  const {
    enabled = true,
    controls,
    skipAmount = 5,
    doubleTapTimeout = 300
  } = options

  const [doubleTapState, setDoubleTapState] = useState<DoubleTapState>({
    side: null,
    visible: false,
    amount: 0
  })

  const lastTapRef = useRef<{
    time: number
    x: number
    y: number
  } | null>(null)

  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const accumulatedSkipRef = useRef<{ left: number; right: number }>({ left: 0, right: 0 })

  const showDoubleTapFeedback = useCallback((side: "left" | "right", amount: number) => {
    // Clear any existing hide timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
    }

    setDoubleTapState({
      side,
      visible: true,
      amount
    })

    // Hide after animation
    hideTimeoutRef.current = setTimeout(() => {
      setDoubleTapState(prev => ({ ...prev, visible: false }))
      // Reset accumulated skip after feedback hides
      setTimeout(() => {
        accumulatedSkipRef.current = { left: 0, right: 0 }
      }, 100)
    }, 600)
  }, [])

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLElement>) => {
    if (!enabled) return

    const touch = e.touches[0]
    const target = e.currentTarget
    const rect = target.getBoundingClientRect()
    
    const x = touch.clientX - rect.left
    const relativeX = x / rect.width

    const now = Date.now()
    const lastTap = lastTapRef.current

    // Check if this is a double tap
    if (
      lastTap &&
      now - lastTap.time < doubleTapTimeout &&
      Math.abs(touch.clientX - lastTap.x) < 50 &&
      Math.abs(touch.clientY - lastTap.y) < 50
    ) {
      // Double tap detected
      e.preventDefault()

      if (relativeX < 0.33) {
        // Left third - skip back
        controls.seekRelative(-skipAmount)
        accumulatedSkipRef.current.left += skipAmount
        showDoubleTapFeedback("left", accumulatedSkipRef.current.left)
      } else if (relativeX > 0.67) {
        // Right third - skip forward
        controls.seekRelative(skipAmount)
        accumulatedSkipRef.current.right += skipAmount
        showDoubleTapFeedback("right", accumulatedSkipRef.current.right)
      }

      // Reset last tap to allow triple tap
      lastTapRef.current = {
        time: now,
        x: touch.clientX,
        y: touch.clientY
      }
    } else {
      // First tap - record it
      lastTapRef.current = {
        time: now,
        x: touch.clientX,
        y: touch.clientY
      }
    }
  }, [enabled, controls, skipAmount, doubleTapTimeout, showDoubleTapFeedback])

  const handleTouchEnd = useCallback((_e: React.TouchEvent<HTMLElement>) => {
    // We handle most logic in touchStart for immediate feedback
    // This is here for potential future use
  }, [])

  return {
    doubleTapState,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchEnd: handleTouchEnd
    }
  }
}

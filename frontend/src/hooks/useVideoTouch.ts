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
  onSingleTap?: () => void
  onCenterTap?: () => void
}

/**
 * Hook to handle mobile touch interactions for video player
 * 
 * Features:
 * - Double-tap left half: Skip back 5 seconds
 * - Double-tap right half: Skip forward 5 seconds
 * - Single tap center: Toggle play/pause (calls onCenterTap)
 * - Single tap elsewhere: Toggle controls (calls onSingleTap)
 */
export function useVideoTouch(options: UseVideoTouchOptions) {
  const {
    enabled = true,
    controls,
    skipAmount = 5,
    doubleTapTimeout = 300,
    onSingleTap,
    onCenterTap
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

  const singleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
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

    // Ignore touches on interactive elements (buttons, control bars, etc.)
    // but allow touches on the overlay background for double-tap skip
    const touchedElement = e.target as HTMLElement
    if (
      touchedElement.closest("button") ||
      touchedElement.closest(".video-mobile-top-bar") ||
      touchedElement.closest(".video-mobile-bottom-bar") ||
      touchedElement.closest(".video-controls") // desktop controls
    ) {
      return
    }

    const touch = e.touches[0]
    const target = e.currentTarget
    const rect = target.getBoundingClientRect()
    
    const x = touch.clientX - rect.left
    const y = touch.clientY - rect.top
    const relativeX = x / rect.width
    const relativeY = y / rect.height

    const now = Date.now()
    const lastTap = lastTapRef.current

    // Clear any pending single tap timeout
    if (singleTapTimeoutRef.current) {
      clearTimeout(singleTapTimeoutRef.current)
      singleTapTimeoutRef.current = undefined
    }

    // Check if this is a double tap
    if (
      lastTap &&
      now - lastTap.time < doubleTapTimeout &&
      Math.abs(touch.clientX - lastTap.x) < 50 &&
      Math.abs(touch.clientY - lastTap.y) < 50
    ) {
      // Double tap detected
      e.preventDefault()

      if (relativeX < 0.5) {
        // Left half - skip back
        controls.seekRelative(-skipAmount)
        accumulatedSkipRef.current.left += skipAmount
        showDoubleTapFeedback("left", accumulatedSkipRef.current.left)
      } else {
        // Right half - skip forward
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
      // Check if tap is in center zone (middle 40% horizontally and vertically)
      const isCenterX = relativeX >= 0.3 && relativeX <= 0.7
      const isCenterY = relativeY >= 0.3 && relativeY <= 0.7

      if (isCenterX && isCenterY) {
        // Center tap - toggle play/pause IMMEDIATELY (no double-tap skip in center)
        onCenterTap?.()
        // Don't record this tap - center taps don't participate in double-tap detection
        lastTapRef.current = null
        return
      }

      // Edge tap - record it and wait for potential double-tap
      lastTapRef.current = {
        time: now,
        x: touch.clientX,
        y: touch.clientY
      }

      // Wait for potential second tap before triggering single tap
      singleTapTimeoutRef.current = setTimeout(() => {
        onSingleTap?.()
        singleTapTimeoutRef.current = undefined
      }, doubleTapTimeout)
    }
  }, [enabled, controls, skipAmount, doubleTapTimeout, showDoubleTapFeedback, onSingleTap, onCenterTap])

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

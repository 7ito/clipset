import { useState, useCallback, useRef } from "react"
import type { VideoControls } from "./useVideoPlayer"

// Swipe gesture thresholds
const SWIPE_START_THRESHOLD = 60    // Start showing visual feedback (after scroll-to-hide zone)
const SWIPE_EXIT_THRESHOLD = 150    // Exit fullscreen when released

export interface DoubleTapState {
  side: "left" | "right" | null
  visible: boolean
  amount: number
}

export interface SwipeState {
  active: boolean       // Is a swipe gesture in progress (past start threshold)?
  direction: "up" | "down" | null  // Swipe direction
  deltaY: number        // Current drag distance from start (absolute value)
  progress: number      // 0 to 1, how close to threshold
}

export interface UseVideoTouchOptions {
  enabled?: boolean
  controls: VideoControls
  skipAmount?: number
  doubleTapTimeout?: number
  onSingleTap?: () => void
  onCenterTap?: () => void
  onDoubleTapSkip?: () => void
  isFullscreen?: boolean
  onEnterFullscreen?: () => void
  onExitFullscreen?: () => void
}

/**
 * Hook to handle mobile touch interactions for video player
 * 
 * Features:
 * - Double-tap left half: Skip back 5 seconds
 * - Double-tap right half: Skip forward 5 seconds
 * - Single tap center: Toggle play/pause (calls onCenterTap)
 * - Single tap elsewhere: Toggle controls (calls onSingleTap)
 * - Swipe up when not fullscreen: Enter fullscreen (with visual feedback)
 * - Swipe down in fullscreen: Exit fullscreen (with visual feedback)
 */
export function useVideoTouch(options: UseVideoTouchOptions) {
  const {
    enabled = true,
    controls,
    skipAmount = 5,
    doubleTapTimeout = 300,
    onSingleTap,
    onCenterTap,
    onDoubleTapSkip,
    isFullscreen = false,
    onEnterFullscreen,
    onExitFullscreen
  } = options

  const [doubleTapState, setDoubleTapState] = useState<DoubleTapState>({
    side: null,
    visible: false,
    amount: 0
  })

  const [swipeState, setSwipeState] = useState<SwipeState>({
    active: false,
    direction: null,
    deltaY: 0,
    progress: 0
  })

  const lastTapRef = useRef<{
    time: number
    x: number
    y: number
  } | null>(null)

  const singleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const accumulatedSkipRef = useRef<{ left: number; right: number }>({ left: 0, right: 0 })
  
  // Swipe tracking refs
  const swipeStartRef = useRef<{ y: number; time: number } | null>(null)
  const isSwipingRef = useRef(false)

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

    // Track start position for potential swipe gesture
    // Swipe up to enter fullscreen (when not fullscreen)
    // Swipe down to exit fullscreen (when fullscreen)
    swipeStartRef.current = { y: touch.clientY, time: now }
    isSwipingRef.current = false

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

      // Hide controls after double-tap skip
      onDoubleTapSkip?.()

      // Reset last tap to allow triple tap
      lastTapRef.current = {
        time: now,
        x: touch.clientX,
        y: touch.clientY
      }
    } else {
      // Check if tap is in center zone (middle 20% horizontally and vertically)
      const isCenterX = relativeX >= 0.4 && relativeX <= 0.6
      const isCenterY = relativeY >= 0.4 && relativeY <= 0.6

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
  }, [enabled, controls, skipAmount, doubleTapTimeout, showDoubleTapFeedback, onSingleTap, onCenterTap, onDoubleTapSkip, isFullscreen])

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLElement>) => {
    if (!enabled || !swipeStartRef.current) return

    const touch = e.touches[0]
    const deltaY = touch.clientY - swipeStartRef.current.y
    const absDeltaY = Math.abs(deltaY)

    // Determine swipe direction
    const isSwipingDown = deltaY > 0
    const isSwipingUp = deltaY < 0

    // Only allow swipe-down in fullscreen, swipe-up when not fullscreen
    const isValidSwipe = (isFullscreen && isSwipingDown) || (!isFullscreen && isSwipingUp)

    if (!isValidSwipe) {
      // Reset if swiping in wrong direction
      if (isSwipingRef.current) {
        isSwipingRef.current = false
        setSwipeState({ active: false, direction: null, deltaY: 0, progress: 0 })
      }
      return
    }

    // Once past the start threshold, activate swipe mode
    if (absDeltaY >= SWIPE_START_THRESHOLD) {
      // Prevent default to stop body scroll once we're in swipe mode
      e.preventDefault()

      // Cancel any pending tap timeouts
      if (singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current)
        singleTapTimeoutRef.current = undefined
      }

      isSwipingRef.current = true

      // Calculate progress (0 to 1) based on distance past start threshold
      const effectiveDelta = absDeltaY - SWIPE_START_THRESHOLD
      const progress = Math.min(effectiveDelta / (SWIPE_EXIT_THRESHOLD - SWIPE_START_THRESHOLD), 1)

      setSwipeState({
        active: true,
        direction: isSwipingUp ? "up" : "down",
        deltaY: absDeltaY,
        progress
      })
    }
  }, [enabled, isFullscreen])

  const handleTouchEnd = useCallback((_e: React.TouchEvent<HTMLElement>) => {
    // Handle swipe gesture completion
    if (isSwipingRef.current && swipeState.active) {
      if (swipeState.deltaY >= SWIPE_EXIT_THRESHOLD) {
        if (swipeState.direction === "down") {
          // Exit fullscreen
          onExitFullscreen?.()
        } else if (swipeState.direction === "up") {
          // Enter fullscreen
          onEnterFullscreen?.()
        }
      }
      // Reset swipe state (will animate back via CSS transition)
      setSwipeState({ active: false, direction: null, deltaY: 0, progress: 0 })
    }

    // Reset swipe tracking
    swipeStartRef.current = null
    isSwipingRef.current = false
  }, [swipeState, onEnterFullscreen, onExitFullscreen])

  return {
    doubleTapState,
    swipeState,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd
    }
  }
}

import { useEffect, useCallback } from "react"
import type { VideoControls, VideoState } from "./useVideoPlayer"

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

export interface UseVideoKeyboardOptions {
  enabled?: boolean
  controls: VideoControls
  state: VideoState
}

/**
 * Hook to handle keyboard shortcuts for video player
 * 
 * Shortcuts:
 * - Space/K: Play/Pause
 * - J: Rewind 10 seconds
 * - L: Forward 10 seconds
 * - Left Arrow: Rewind 5 seconds
 * - Right Arrow: Forward 5 seconds
 * - Up Arrow: Volume +5%
 * - Down Arrow: Volume -5%
 * - M: Toggle mute
 * - F: Toggle fullscreen
 * - 0-9: Jump to 0-90% of video
 * - < (,): Decrease playback speed
 * - > (.): Increase playback speed
 */
export function useVideoKeyboard(
  containerRef: React.RefObject<HTMLElement | null>,
  options: UseVideoKeyboardOptions
) {
  const { enabled = true, controls, state } = options

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't handle shortcuts if focused on input elements
    const target = e.target as HTMLElement
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable
    ) {
      return
    }

    // Check if the container or its children have focus
    const container = containerRef.current
    if (!container) return

    // Allow shortcuts when player or its children are focused, or when no specific element has focus
    const isPlayerFocused = container.contains(document.activeElement) || 
                           document.activeElement === document.body

    if (!isPlayerFocused) return

    const key = e.key.toLowerCase()
    let handled = true

    switch (key) {
      case " ":
      case "k":
        controls.togglePlay()
        break

      case "j":
        controls.seekRelative(-10)
        break

      case "l":
        controls.seekRelative(10)
        break

      case "arrowleft":
        controls.seekRelative(-5)
        break

      case "arrowright":
        controls.seekRelative(5)
        break

      case "arrowup":
        e.preventDefault() // Prevent page scroll
        controls.setVolume(Math.min(1, state.volume + 0.05))
        break

      case "arrowdown":
        e.preventDefault() // Prevent page scroll
        controls.setVolume(Math.max(0, state.volume - 0.05))
        break

      case "m":
        controls.toggleMute()
        break

      case "f":
        controls.toggleFullscreen()
        break

      case ",":
      case "<": {
        // Decrease playback rate
        const currentIndex = PLAYBACK_RATES.indexOf(state.playbackRate)
        if (currentIndex > 0) {
          controls.setPlaybackRate(PLAYBACK_RATES[currentIndex - 1])
        }
        break
      }

      case ".":
      case ">": {
        // Increase playback rate
        const currentIndex = PLAYBACK_RATES.indexOf(state.playbackRate)
        if (currentIndex < PLAYBACK_RATES.length - 1) {
          controls.setPlaybackRate(PLAYBACK_RATES[currentIndex + 1])
        }
        break
      }

      case "0":
      case "1":
      case "2":
      case "3":
      case "4":
      case "5":
      case "6":
      case "7":
      case "8":
      case "9": {
        const percent = parseInt(key, 10) * 10
        controls.seekPercent(percent)
        break
      }

      default:
        handled = false
    }

    if (handled) {
      e.preventDefault()
      e.stopPropagation()
    }
  }, [containerRef, controls, state.volume, state.playbackRate])

  useEffect(() => {
    if (!enabled) return

    // Listen on document to capture all keyboard events
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [enabled, handleKeyDown])
}

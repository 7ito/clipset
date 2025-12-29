import { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from "react"
import { Play, Loader2, RotateCcw, RotateCw } from "lucide-react"
import { useVideoPlayer } from "@/hooks/useVideoPlayer"
import { useVideoKeyboard } from "@/hooks/useVideoKeyboard"
import { useVideoTouch } from "@/hooks/useVideoTouch"
import { VideoControls } from "./VideoControls"

export interface VideoPlayerProps {
  src: string
  poster?: string
  initialTime?: number
  autoPlay?: boolean
  onPlay?: () => void
  onPause?: () => void
  onEnded?: () => void
  onTimeUpdate?: (time: number) => void
  onReady?: () => void
}

export interface VideoPlayerRef {
  seekTo: (time: number) => void
  play: () => void
  pause: () => void
  getCurrentTime: () => number
}

export const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(function VideoPlayer(
  {
    src,
    poster,
    initialTime = 0,
    autoPlay = true,
    onPlay,
    onPause,
    onEnded,
    onTimeUpdate,
    onReady
  },
  ref
) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [controlsVisible, setControlsVisible] = useState(true)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const { state, controls } = useVideoPlayer(videoRef, containerRef, {
    initialTime,
    autoPlay,
    onPlay,
    onPause,
    onEnded,
    onTimeUpdate,
    onReady
  })

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    seekTo: controls.seek,
    play: controls.play,
    pause: controls.pause,
    getCurrentTime: () => state.currentTime
  }), [controls, state.currentTime])

  // Keyboard shortcuts
  useVideoKeyboard(containerRef, {
    controls,
    state,
    enabled: true
  })

  // Mobile touch handling
  const { doubleTapState, handlers: touchHandlers } = useVideoTouch({
    controls,
    enabled: true,
    skipAmount: 5
  })

  // Auto-hide controls
  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
    }
    if (state.isPlaying) {
      hideTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false)
      }, 3000)
    }
  }, [state.isPlaying])

  // Show controls on any interaction
  const handleMouseMove = useCallback(() => {
    showControls()
  }, [showControls])

  const handleMouseLeave = useCallback(() => {
    if (state.isPlaying) {
      setControlsVisible(false)
    }
  }, [state.isPlaying])

  // Keep controls visible when paused
  useEffect(() => {
    if (!state.isPlaying) {
      setControlsVisible(true)
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
      }
    } else {
      showControls()
    }
  }, [state.isPlaying, showControls])

  // Click on video to toggle play/pause
  const handleVideoClick = useCallback((e: React.MouseEvent) => {
    // Don't toggle if clicking on controls
    if ((e.target as HTMLElement).closest(".video-controls")) {
      return
    }
    controls.togglePlay()
  }, [controls])

  // Double-click to toggle fullscreen
  const handleVideoDoubleClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".video-controls")) {
      return
    }
    controls.toggleFullscreen()
  }, [controls])

  return (
    <div
      ref={containerRef}
      className={`video-player-container ${state.isFullscreen ? "fullscreen" : ""}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      tabIndex={0}
    >
      <video
        ref={videoRef}
        className="video-player-video"
        src={src}
        poster={poster}
        playsInline
        preload="metadata"
        onClick={handleVideoClick}
        onDoubleClick={handleVideoDoubleClick}
        {...touchHandlers}
      />

      {/* Center play button (shown when paused and not loading) */}
      {!state.isPlaying && !state.isLoading && state.isReady && (
        <button
          className="video-center-play"
          onClick={controls.togglePlay}
          aria-label="Play"
        >
          <Play className="w-16 h-16" />
        </button>
      )}

      {/* Loading spinner */}
      {state.isLoading && (
        <div className="video-loading">
          <Loader2 className="w-12 h-12 animate-spin" />
        </div>
      )}

      {/* Double-tap skip indicators */}
      {doubleTapState.visible && (
        <div className={`video-double-tap-indicator ${doubleTapState.side}`}>
          <div className="video-double-tap-content">
            {doubleTapState.side === "left" ? (
              <>
                <RotateCcw className="w-8 h-8" />
                <span>{doubleTapState.amount}s</span>
              </>
            ) : (
              <>
                <RotateCw className="w-8 h-8" />
                <span>{doubleTapState.amount}s</span>
              </>
            )}
          </div>
          {/* Ripple effect */}
          <div className="video-double-tap-ripple" />
        </div>
      )}

      {/* Gradient overlay at bottom for controls visibility */}
      <div className={`video-gradient-overlay ${controlsVisible ? "visible" : ""}`} />

      {/* Controls overlay */}
      <VideoControls
        state={state}
        controls={controls}
        visible={controlsVisible}
      />
    </div>
  )
})

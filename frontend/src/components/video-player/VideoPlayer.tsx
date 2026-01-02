import { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from "react"
import { Play, Loader2, RotateCcw, RotateCw } from "lucide-react"
import Hls from "hls.js"
import { useVideoPlayer } from "@/hooks/useVideoPlayer"
import { useVideoKeyboard } from "@/hooks/useVideoKeyboard"
import { useVideoTouch } from "@/hooks/useVideoTouch"
import { VideoControls } from "./VideoControls"
import { cn } from "@/lib/utils"

export interface VideoPlayerProps {
  /** Progressive MP4 source URL */
  src: string
  /** HLS manifest URL (optional - will use HLS if provided and supported) */
  hlsSrc?: string
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
    hlsSrc,
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
  const hlsRef = useRef<Hls | null>(null)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [isHlsActive, setIsHlsActive] = useState(false)
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

  // Initialize HLS.js when hlsSrc is provided
  useEffect(() => {
    const video = videoRef.current
    if (!video || !hlsSrc) {
      // No HLS source, use progressive
      setIsHlsActive(false)
      return
    }

    // Check if browser supports HLS natively (Safari)
    // Note: Some browsers return "maybe" but don't actually support native HLS
    // Only Safari truly supports native HLS, so we check for Safari specifically
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    const canPlayNativeHls = video.canPlayType("application/vnd.apple.mpegurl") === "probably" || 
                             (isSafari && video.canPlayType("application/vnd.apple.mpegurl"))
    
    if (canPlayNativeHls) {
      // Safari has native HLS support
      video.src = hlsSrc
      setIsHlsActive(true)
      return
    }

    // Use hls.js for other browsers
    if (Hls.isSupported()) {
      // Extract token from hlsSrc URL for use in segment requests
      const url = new URL(hlsSrc, window.location.origin)
      const token = url.searchParams.get("token")
      
      const hls = new Hls({
        // Enable low latency mode for better seeking
        enableWorker: true,
        lowLatencyMode: false,
        // Start loading from the beginning
        startPosition: initialTime,
        // Add token to all requests (manifest, segments, etc.)
        xhrSetup: (xhr, requestUrl) => {
          if (token && !requestUrl.includes("token=")) {
            // Add token as query parameter
            const separator = requestUrl.includes("?") ? "&" : "?"
            xhr.open("GET", requestUrl + separator + "token=" + token, true)
          }
        },
      })

      hls.loadSource(hlsSrc)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsHlsActive(true)
        // If autoplay is enabled, the useVideoPlayer hook will handle it
      })

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // Try to recover network error
              console.error("HLS network error, attempting recovery...", data)
              hls.startLoad()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error("HLS media error, attempting recovery...", data)
              hls.recoverMediaError()
              break
            default:
              // Cannot recover
              console.error("HLS fatal error, falling back to progressive", data)
              hls.destroy()
              setIsHlsActive(false)
              // Fall back to progressive source
              video.src = src
              break
          }
        }
      })

      hlsRef.current = hls

      return () => {
        hls.destroy()
        hlsRef.current = null
      }
    } else {
      // HLS not supported, fall back to progressive
      console.warn("HLS not supported, using progressive playback")
      setIsHlsActive(false)
    }
  }, [hlsSrc, src, initialTime])

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
      className={cn(
        "video-player-container",
        state.isFullscreen && "fullscreen"
      )}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      tabIndex={0}
    >
      <video
        ref={videoRef}
        className="video-player-video"
        src={!hlsSrc || !isHlsActive ? src : undefined}
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

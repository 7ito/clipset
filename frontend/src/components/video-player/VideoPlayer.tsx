import { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from "react"
import { Loader2, RotateCcw, RotateCw } from "lucide-react"
import Hls from "hls.js"
import { useVideoPlayer } from "@/hooks/useVideoPlayer"
import { useVideoKeyboard } from "@/hooks/useVideoKeyboard"
import { useVideoTouch } from "@/hooks/useVideoTouch"
import { VideoControls } from "./VideoControls"
import { cn } from "@/lib/utils"

// Check if device is mobile based on screen width
// We use screen width as the primary indicator since touch detection
// can be unreliable (some laptops have touch screens, Playwright tests, etc.)
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const checkMobile = () => {
      // Primary check: screen width (768px is typical tablet/mobile breakpoint)
      const isSmallScreen = window.matchMedia("(max-width: 768px)").matches
      // Secondary check: pointer type (coarse = touch, fine = mouse)
      const hasCoarsePointer = window.matchMedia("(pointer: coarse)").matches
      // Consider mobile if small screen OR if it's a touch-primary device with no fine pointer
      const hasNoFinePointer = !window.matchMedia("(pointer: fine)").matches
      setIsMobile(isSmallScreen || (hasCoarsePointer && hasNoFinePointer))
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])
  return isMobile
}

export interface VideoPlayerProps {
  /** Progressive MP4 source URL */
  src: string
  /** HLS manifest URL (optional - will use HLS if provided and supported) */
  hlsSrc?: string
  /** Video title (displayed in mobile overlay) */
  title?: string
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
    title,
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
  // Track if we're using native HLS (Safari/iOS) vs hls.js
  // This is needed to let React control the video src attribute for native HLS
  const [useNativeHls, setUseNativeHls] = useState(false)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const isMobile = useIsMobile()
  // Track if user is seeking (to show only progress bar on mobile)
  const [isSeeking, setIsSeeking] = useState(false)

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
      setUseNativeHls(false)
      return
    }

    // Check if browser supports HLS natively (Safari/iOS)
    // Note: Some browsers return "maybe" but don't actually support native HLS
    // Only Safari truly supports native HLS, so we check for Safari specifically
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    const canPlayNativeHls = video.canPlayType("application/vnd.apple.mpegurl") === "probably" || 
                             (isSafari && video.canPlayType("application/vnd.apple.mpegurl"))
    
    if (canPlayNativeHls) {
      // Safari/iOS has native HLS support
      // Don't set video.src here - let React control it via the src attribute
      // to avoid race conditions where React re-render clears the src
      setUseNativeHls(true)
      setIsHlsActive(true)
      return
    }

    // Use hls.js for other browsers (Chrome, Firefox, Android, etc.)
    setUseNativeHls(false)
    
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
              setUseNativeHls(false)
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

  // Mobile touch handling - toggle controls on single tap, skip on double tap
  const handleSingleTap = useCallback(() => {
    if (isMobile) {
      if (controlsVisible) {
        setControlsVisible(false)
      } else {
        showControls()
      }
    }
  }, [isMobile, controlsVisible, showControls])

  const { doubleTapState, handlers: touchHandlers } = useVideoTouch({
    controls,
    enabled: isMobile, // Only enable touch handling on mobile
    skipAmount: 5,
    onSingleTap: handleSingleTap
  })

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

  // Click on video to toggle play/pause (desktop only - mobile uses touch handlers)
  const handleVideoClick = useCallback((e: React.MouseEvent) => {
    // Don't toggle if clicking on controls
    if ((e.target as HTMLElement).closest(".video-controls")) {
      return
    }
    // Desktop: toggle play/pause
    // Mobile is handled by touch handlers with single tap detection
    if (!isMobile) {
      controls.togglePlay()
    }
  }, [controls, isMobile])

  // Double-click to toggle fullscreen (desktop only - conflicts with double-tap skip on mobile)
  const handleVideoDoubleClick = useCallback((e: React.MouseEvent) => {
    if (isMobile) return // Disable on mobile to avoid conflict with double-tap skip
    if ((e.target as HTMLElement).closest(".video-controls")) {
      return
    }
    controls.toggleFullscreen()
  }, [controls, isMobile])

  // Seek handlers for mobile (to show only progress bar during seek)
  const handleSeekStart = useCallback(() => {
    setIsSeeking(true)
  }, [])

  const handleSeekEnd = useCallback(() => {
    setIsSeeking(false)
    showControls() // Restart auto-hide timer
  }, [showControls])

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
      {...(isMobile ? touchHandlers : {})}
    >
      <video
        ref={videoRef}
        className="video-player-video"
        // Video source selection:
        // 1. Native HLS (Safari/iOS): Use hlsSrc directly - React controls the src attribute
        // 2. hls.js (Chrome/Firefox/Android): src is undefined - hls.js manages via MediaSource
        // 3. Progressive fallback: Use progressive MP4 src
        src={
          useNativeHls && hlsSrc
            ? hlsSrc                           // Native Safari/iOS HLS
            : isHlsActive
              ? undefined                      // hls.js manages via MediaSource
              : src                            // Progressive MP4 fallback
        }
        poster={poster}
        playsInline
        preload="metadata"
        onClick={handleVideoClick}
        onDoubleClick={handleVideoDoubleClick}
      />

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

      {/* Gradient overlay at bottom for controls visibility (desktop only) */}
      {!isMobile && (
        <div className={`video-gradient-overlay ${controlsVisible ? "visible" : ""}`} />
      )}

      {/* Controls overlay */}
      <VideoControls
        state={state}
        controls={controls}
        visible={controlsVisible}
        isMobile={isMobile}
        title={title}
        isSeeking={isSeeking}
        onSeekStart={handleSeekStart}
        onSeekEnd={handleSeekEnd}
        onDismiss={() => setControlsVisible(false)}
      />
    </div>
  )
})

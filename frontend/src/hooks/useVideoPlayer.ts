import { useState, useCallback, useRef, useEffect } from "react"

export interface VideoState {
  isPlaying: boolean
  currentTime: number
  duration: number
  buffered: TimeRanges | null
  volume: number
  isMuted: boolean
  playbackRate: number
  isFullscreen: boolean
  isLoading: boolean
  hasError: boolean
  isReady: boolean
}

export interface VideoControls {
  play: () => void
  pause: () => void
  togglePlay: () => void
  seek: (time: number) => void
  seekRelative: (delta: number) => void
  seekPercent: (percent: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  setPlaybackRate: (rate: number) => void
  toggleFullscreen: () => void
  requestFullscreen: () => void
  exitFullscreen: () => void
}

export interface UseVideoPlayerOptions {
  initialTime?: number
  initialVolume?: number
  initialPlaybackRate?: number
  autoPlay?: boolean
  onPlay?: () => void
  onPause?: () => void
  onEnded?: () => void
  onTimeUpdate?: (time: number) => void
  onReady?: () => void
  onError?: (error: Event) => void
}

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

// Storage keys for persisting preferences
const STORAGE_KEYS = {
  volume: "clipset_player_volume",
  muted: "clipset_player_muted",
  playbackRate: "clipset_player_rate"
}

function getStoredValue<T>(key: string, defaultValue: T): T {
  if (typeof window === "undefined") return defaultValue
  try {
    const stored = localStorage.getItem(key)
    if (stored !== null) {
      return JSON.parse(stored) as T
    }
  } catch {
    // Ignore storage errors
  }
  return defaultValue
}

function setStoredValue<T>(key: string, value: T): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore storage errors
  }
}

export function useVideoPlayer(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  containerRef: React.RefObject<HTMLElement | null>,
  options: UseVideoPlayerOptions = {}
) {
  const {
    initialTime = 0,
    initialVolume,
    initialPlaybackRate,
    autoPlay = false,
    onPlay,
    onPause,
    onEnded,
    onTimeUpdate,
    onReady,
    onError
  } = options

  // Load persisted preferences
  const storedVolume = getStoredValue(STORAGE_KEYS.volume, 1)
  const storedMuted = getStoredValue(STORAGE_KEYS.muted, false)
  const storedRate = getStoredValue(STORAGE_KEYS.playbackRate, 1)

  const [state, setState] = useState<VideoState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    buffered: null,
    volume: initialVolume ?? storedVolume,
    isMuted: storedMuted,
    playbackRate: initialPlaybackRate ?? storedRate,
    isFullscreen: false,
    isLoading: true,
    hasError: false,
    isReady: false
  })

  // Track if we've seeked to initial time
  const hasInitialSeeked = useRef<boolean>(false)
  const animationFrameRef = useRef<number | undefined>(undefined)

  // Update time continuously using requestAnimationFrame for smoother progress bar
  const updateTime = useCallback(() => {
    const video = videoRef.current
    if (video && !video.paused && !video.ended) {
      setState(prev => ({
        ...prev,
        currentTime: video.currentTime,
        buffered: video.buffered
      }))
      animationFrameRef.current = requestAnimationFrame(() => updateTime())
    }
  }, [videoRef])

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleLoadedMetadata = () => {
      setState(prev => ({
        ...prev,
        duration: video.duration,
        isLoading: false
      }))

      // Apply initial settings
      video.volume = state.volume
      video.muted = state.isMuted
      video.playbackRate = state.playbackRate

      // Seek to initial time if specified
      if (initialTime > 0 && !hasInitialSeeked.current) {
        video.currentTime = Math.min(initialTime, video.duration)
        hasInitialSeeked.current = true
      }
    }

    const handleCanPlay = () => {
      setState(prev => ({ ...prev, isReady: true, isLoading: false }))
      onReady?.()

      if (autoPlay) {
        video.play().catch(() => {
          // Autoplay blocked, that's okay
        })
      }
    }

    const handlePlay = () => {
      setState(prev => ({ ...prev, isPlaying: true }))
      animationFrameRef.current = requestAnimationFrame(updateTime)
      onPlay?.()
    }

    const handlePause = () => {
      setState(prev => ({ ...prev, isPlaying: false }))
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      onPause?.()
    }

    const handleEnded = () => {
      setState(prev => ({ ...prev, isPlaying: false }))
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      onEnded?.()
    }

    const handleTimeUpdate = () => {
      // Also update on timeupdate for when paused or seeking
      setState(prev => ({
        ...prev,
        currentTime: video.currentTime,
        buffered: video.buffered
      }))
      onTimeUpdate?.(video.currentTime)
    }

    const handleVolumeChange = () => {
      setState(prev => ({
        ...prev,
        volume: video.volume,
        isMuted: video.muted
      }))
    }

    const handleRateChange = () => {
      setState(prev => ({ ...prev, playbackRate: video.playbackRate }))
    }

    const handleWaiting = () => {
      setState(prev => ({ ...prev, isLoading: true }))
    }

    const handlePlaying = () => {
      setState(prev => ({ ...prev, isLoading: false }))
    }

    const handleError = (e: Event) => {
      setState(prev => ({ ...prev, hasError: true, isLoading: false }))
      onError?.(e)
    }

    const handleProgress = () => {
      setState(prev => ({ ...prev, buffered: video.buffered }))
    }

    const handleSeeking = () => {
      setState(prev => ({ ...prev, isLoading: true }))
    }

    const handleSeeked = () => {
      setState(prev => ({ 
        ...prev, 
        isLoading: false,
        currentTime: video.currentTime 
      }))
    }

    // Add event listeners
    video.addEventListener("loadedmetadata", handleLoadedMetadata)
    video.addEventListener("canplay", handleCanPlay)
    video.addEventListener("play", handlePlay)
    video.addEventListener("pause", handlePause)
    video.addEventListener("ended", handleEnded)
    video.addEventListener("timeupdate", handleTimeUpdate)
    video.addEventListener("volumechange", handleVolumeChange)
    video.addEventListener("ratechange", handleRateChange)
    video.addEventListener("waiting", handleWaiting)
    video.addEventListener("playing", handlePlaying)
    video.addEventListener("error", handleError)
    video.addEventListener("progress", handleProgress)
    video.addEventListener("seeking", handleSeeking)
    video.addEventListener("seeked", handleSeeked)

    // If video already has metadata (e.g., from cache)
    if (video.readyState >= 1) {
      handleLoadedMetadata()
    }
    if (video.readyState >= 3) {
      handleCanPlay()
    }

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata)
      video.removeEventListener("canplay", handleCanPlay)
      video.removeEventListener("play", handlePlay)
      video.removeEventListener("pause", handlePause)
      video.removeEventListener("ended", handleEnded)
      video.removeEventListener("timeupdate", handleTimeUpdate)
      video.removeEventListener("volumechange", handleVolumeChange)
      video.removeEventListener("ratechange", handleRateChange)
      video.removeEventListener("waiting", handleWaiting)
      video.removeEventListener("playing", handlePlaying)
      video.removeEventListener("error", handleError)
      video.removeEventListener("progress", handleProgress)
      video.removeEventListener("seeking", handleSeeking)
      video.removeEventListener("seeked", handleSeeked)

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [videoRef, initialTime, autoPlay, updateTime, onPlay, onPause, onEnded, onTimeUpdate, onReady, onError, state.volume, state.isMuted, state.playbackRate])

  // Fullscreen change handler
  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as any
      const isFs = !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement)
      setState(prev => ({ ...prev, isFullscreen: isFs }))
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange)
    document.addEventListener("mozfullscreenchange", handleFullscreenChange)
    document.addEventListener("MSFullscreenChange", handleFullscreenChange)
    
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange)
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange)
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange)
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange)
    }
  }, [])

  // iOS native fullscreen event listeners
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleBeginFullscreen = () => {
      setState(prev => ({ ...prev, isFullscreen: true }))
    }

    const handleEndFullscreen = () => {
      setState(prev => ({ ...prev, isFullscreen: false }))
    }

    const v = video as any
    v.addEventListener("webkitbeginfullscreen", handleBeginFullscreen)
    v.addEventListener("webkitendfullscreen", handleEndFullscreen)

    return () => {
      v.removeEventListener("webkitbeginfullscreen", handleBeginFullscreen)
      v.removeEventListener("webkitendfullscreen", handleEndFullscreen)
    }
  }, [videoRef])

  // Controls
  const play = useCallback(() => {
    videoRef.current?.play().catch(() => {
      // Play was prevented
    })
  }, [videoRef])

  const pause = useCallback(() => {
    videoRef.current?.pause()
  }, [videoRef])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      play()
    } else {
      pause()
    }
  }, [videoRef, play, pause])

  const seek = useCallback((time: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.max(0, Math.min(time, video.duration || 0))
  }, [videoRef])

  const seekRelative = useCallback((delta: number) => {
    const video = videoRef.current
    if (!video) return
    const newTime = video.currentTime + delta
    video.currentTime = Math.max(0, Math.min(newTime, video.duration || 0))
  }, [videoRef])

  const seekPercent = useCallback((percent: number) => {
    const video = videoRef.current
    if (!video || !video.duration) return
    const time = (percent / 100) * video.duration
    video.currentTime = Math.max(0, Math.min(time, video.duration))
  }, [videoRef])

  const setVolume = useCallback((volume: number) => {
    const video = videoRef.current
    if (!video) return
    const clampedVolume = Math.max(0, Math.min(1, volume))
    video.volume = clampedVolume
    if (clampedVolume > 0 && video.muted) {
      video.muted = false
    }
    setStoredValue(STORAGE_KEYS.volume, clampedVolume)
    setStoredValue(STORAGE_KEYS.muted, false)
  }, [videoRef])

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setStoredValue(STORAGE_KEYS.muted, video.muted)
  }, [videoRef])

  const setPlaybackRate = useCallback((rate: number) => {
    const video = videoRef.current
    if (!video) return
    // Clamp to valid rates
    const validRate = PLAYBACK_RATES.includes(rate) ? rate : 1
    video.playbackRate = validRate
    setStoredValue(STORAGE_KEYS.playbackRate, validRate)
  }, [videoRef])

  // Track if we're using CSS-based fullscreen (for browsers without Fullscreen API support)
  const usingCssFullscreenRef = useRef(false)

  const requestFullscreen = useCallback(async () => {
    const container = containerRef.current
    if (!container) return
    
    const c = container as any
    const doc = document as any
    
    // Try native Fullscreen API first
    try {
      if (c.requestFullscreen && doc.fullscreenEnabled) {
        await c.requestFullscreen()
        return
      } else if (c.webkitRequestFullscreen && doc.webkitFullscreenEnabled) {
        await c.webkitRequestFullscreen()
        return
      } else if (c.mozRequestFullScreen && doc.mozFullScreenEnabled) {
        await c.mozRequestFullScreen()
        return
      } else if (c.msRequestFullscreen && doc.msFullscreenEnabled) {
        await c.msRequestFullscreen()
        return
      }
    } catch (err) {
      console.warn("Native fullscreen failed, falling back to CSS fullscreen:", err)
    }
    
    // Fallback: CSS-based fullscreen (works on iOS Safari)
    usingCssFullscreenRef.current = true
    container.classList.add("fullscreen")
    setState(prev => ({ ...prev, isFullscreen: true }))
    
    // Prevent body scroll when in CSS fullscreen
    document.body.style.overflow = "hidden"
  }, [containerRef])

  const exitFullscreen = useCallback(() => {
    const container = containerRef.current
    const doc = document as any
    
    // Check if we're using CSS-based fullscreen
    if (usingCssFullscreenRef.current) {
      usingCssFullscreenRef.current = false
      container?.classList.remove("fullscreen")
      setState(prev => ({ ...prev, isFullscreen: false }))
      document.body.style.overflow = ""
      return
    }
    
    // Native fullscreen exit
    if (doc.exitFullscreen) {
      doc.exitFullscreen()
    } else if (doc.webkitExitFullscreen) {
      doc.webkitExitFullscreen()
    } else if (doc.webkitCancelFullScreen) {
      doc.webkitCancelFullScreen()
    } else if (doc.mozCancelFullScreen) {
      doc.mozCancelFullScreen()
    } else if (doc.msExitFullscreen) {
      doc.msExitFullscreen()
    }
  }, [containerRef])

  const toggleFullscreen = useCallback(() => {
    if (state.isFullscreen) {
      exitFullscreen()
    } else {
      requestFullscreen()
    }
  }, [state.isFullscreen, requestFullscreen, exitFullscreen])

  const controls: VideoControls = {
    play,
    pause,
    togglePlay,
    seek,
    seekRelative,
    seekPercent,
    setVolume,
    toggleMute,
    setPlaybackRate,
    toggleFullscreen,
    requestFullscreen,
    exitFullscreen
  }

  return {
    state,
    controls,
    PLAYBACK_RATES
  }
}

export { PLAYBACK_RATES }

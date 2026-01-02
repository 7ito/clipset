import { Play, Pause, Maximize, Minimize, Loader2 } from "lucide-react"
import { formatTimestamp } from "@/lib/timestamps"
import { ProgressBar } from "./ProgressBar"
import { VolumeControl } from "./VolumeControl"
import { PlaybackSpeedMenu } from "./PlaybackSpeedMenu"
import { cn } from "@/lib/utils"
import type { VideoState, VideoControls as VideoControlsType } from "@/hooks/useVideoPlayer"

interface VideoControlsProps {
  state: VideoState
  controls: VideoControlsType
  visible: boolean
  isMobile?: boolean
  title?: string
  isSeeking?: boolean
  onSeekStart?: () => void
  onSeekEnd?: () => void
  onDismiss?: () => void
}

export function VideoControls({
  state,
  controls,
  visible,
  isMobile = false,
  title,
  isSeeking = false,
  onSeekStart,
  onSeekEnd,
  onDismiss
}: VideoControlsProps) { 
  const {
    isPlaying,
    currentTime,
    duration,
    buffered,
    volume,
    isMuted,
    playbackRate,
    isFullscreen,
    isLoading
  } = state

  // Mobile layout
  if (isMobile) {
    return (
      <div className={cn(
        "video-controls-mobile",
        visible && "visible",
        isSeeking && "seek-mode"
      )}>
        {/* Dimmed overlay background - tap to dismiss */}
        <div 
          className="video-mobile-overlay-bg" 
          onClick={(e) => {
            e.stopPropagation()
            onDismiss?.()
          }}
        />

        {/* Top bar with title and settings */}
        <div className="video-mobile-top-bar">
          <span className="video-mobile-title">{title || "Video"}</span>
          <PlaybackSpeedMenu
            currentRate={playbackRate}
            onRateChange={controls.setPlaybackRate}
            isMobile={true}
          />
        </div>

        {/* Center play/pause button (no background, just icon) */}
        <button
          className="video-mobile-center-play"
          onClick={(e) => {
            e.stopPropagation()
            controls.togglePlay()
          }}
        >
          {isLoading ? (
            <Loader2 className="w-16 h-16 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-16 h-16" />
          ) : (
            <Play className="w-16 h-16 ml-1" />
          )}
        </button>

        {/* Bottom bar with progress and fullscreen */}
        <div className="video-mobile-bottom-bar">
          <span className="video-mobile-time">{formatTimestamp(currentTime)}</span>
          <div className="video-mobile-progress">
            <ProgressBar
              currentTime={currentTime}
              duration={duration}
              buffered={buffered}
              onSeek={controls.seek}
              onSeekStart={onSeekStart}
              onSeekEnd={onSeekEnd}
            />
          </div>
          <span className="video-mobile-time">{formatTimestamp(duration)}</span>
          <button
            className="video-mobile-fullscreen"
            onClick={(e) => {
              e.stopPropagation()
              controls.toggleFullscreen()
            }}
          >
            {isFullscreen ? (
              <Minimize className="w-6 h-6" />
            ) : (
              <Maximize className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>
    )
  }

  // Desktop layout (unchanged)
  return (
    <div className={`video-controls ${visible ? "visible" : ""}`}>
      {/* Progress bar at top of controls */}
      <ProgressBar
        currentTime={currentTime}
        duration={duration}
        buffered={buffered}
        onSeek={controls.seek}
      />

      {/* Control buttons */}
      <div className="video-controls-bar">
        {/* Left side controls */}
        <div className="video-controls-left">
          {/* Play/Pause button */}
          <button
            className="video-control-button"
            onClick={controls.togglePlay}
            title={isPlaying ? "Pause (K)" : "Play (K)"}
          >
            {isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-6 h-6" />
            ) : (
              <Play className="w-6 h-6" />
            )}
          </button>

          {/* Volume control */}
          <VolumeControl
            volume={volume}
            isMuted={isMuted}
            onVolumeChange={controls.setVolume}
            onToggleMute={controls.toggleMute}
          />

          {/* Time display */}
          <div className="video-time-display">
            <span>{formatTimestamp(currentTime)}</span>
            <span className="video-time-separator">/</span>
            <span>{formatTimestamp(duration)}</span>
          </div>
        </div>

        {/* Right side controls */}
        <div className="video-controls-right">
          {/* Playback speed */}
          <PlaybackSpeedMenu
            currentRate={playbackRate}
            onRateChange={controls.setPlaybackRate}
          />

          {/* Fullscreen button */}
          <button
            className="video-control-button"
            onClick={controls.toggleFullscreen}
            title={isFullscreen ? "Exit Fullscreen (F)" : "Fullscreen (F)"}
          >
            {isFullscreen ? (
              <Minimize className="w-6 h-6" />
            ) : (
              <Maximize className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

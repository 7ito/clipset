import { Play, Pause, Maximize, Minimize, Loader2 } from "lucide-react"
import { formatTimestamp } from "@/lib/timestamps"
import { ProgressBar } from "./ProgressBar"
import { VolumeControl } from "./VolumeControl"
import { PlaybackSpeedMenu } from "./PlaybackSpeedMenu"
import type { VideoState, VideoControls as VideoControlsType } from "@/hooks/useVideoPlayer"

interface VideoControlsProps {
  state: VideoState
  controls: VideoControlsType
  visible: boolean
}

export function VideoControls({
  state,
  controls,
  visible
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

import { useState, useCallback, useRef } from "react"
import { Volume2, Volume1, VolumeX } from "lucide-react"

interface VolumeControlProps {
  volume: number
  isMuted: boolean
  onVolumeChange: (volume: number) => void
  onToggleMute: () => void
}

export function VolumeControl({
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute
}: VolumeControlProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const sliderRef = useRef<HTMLDivElement>(null)

  const effectiveVolume = isMuted ? 0 : volume

  const getVolumeIcon = () => {
    if (isMuted || volume === 0) {
      return <VolumeX className="w-5 h-5" />
    }
    if (volume < 0.5) {
      return <Volume1 className="w-5 h-5" />
    }
    return <Volume2 className="w-5 h-5" />
  }

  const calculateVolumeFromPosition = useCallback((clientY: number): number => {
    if (!sliderRef.current) return volume
    const rect = sliderRef.current.getBoundingClientRect()
    // Invert because Y increases downward but volume should increase upward
    const percent = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    return percent
  }, [volume])

  const handleSliderMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    const newVolume = calculateVolumeFromPosition(e.clientY)
    onVolumeChange(newVolume)

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const newVolume = calculateVolumeFromPosition(e.clientY)
      onVolumeChange(newVolume)
    }

    const handleGlobalMouseUp = () => {
      setIsDragging(false)
      document.removeEventListener("mousemove", handleGlobalMouseMove)
      document.removeEventListener("mouseup", handleGlobalMouseUp)
    }

    document.addEventListener("mousemove", handleGlobalMouseMove)
    document.addEventListener("mouseup", handleGlobalMouseUp)
  }, [calculateVolumeFromPosition, onVolumeChange])

  const showSlider = isHovered || isDragging

  return (
    <div
      className="video-volume-container"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => !isDragging && setIsHovered(false)}
    >
      <button
        className="video-control-button"
        onClick={onToggleMute}
        title={isMuted ? "Unmute (M)" : "Mute (M)"}
      >
        {getVolumeIcon()}
      </button>

      {/* Vertical slider popup */}
      <div className={`video-volume-slider-popup ${showSlider ? "visible" : ""}`}>
        <div
          ref={sliderRef}
          className="video-volume-slider"
          onMouseDown={handleSliderMouseDown}
        >
          {/* Background track */}
          <div className="video-volume-track" />

          {/* Filled portion */}
          <div
            className="video-volume-fill"
            style={{ height: `${effectiveVolume * 100}%` }}
          />

          {/* Handle */}
          <div
            className="video-volume-handle"
            style={{ bottom: `${effectiveVolume * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}

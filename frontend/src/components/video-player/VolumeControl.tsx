import { useState, useRef, useEffect } from "react"
import { Volume2, Volume1, VolumeX } from "lucide-react"

interface VolumeControlProps {
  volume: number
  isMuted: boolean
  onVolumeChange: (volume: number) => void
  onToggleMute: () => void
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const checkMobile = () => {
      const isSmallScreen = window.matchMedia("(max-width: 768px)").matches
      const hasCoarsePointer = window.matchMedia("(pointer: coarse)").matches
      const hasNoFinePointer = !window.matchMedia("(pointer: fine)").matches
      setIsMobile(isSmallScreen || (hasCoarsePointer && hasNoFinePointer))
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])
  return isMobile
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
  const isMobile = useIsMobile()

  // Hide volume control entirely on mobile (use hardware volume controls)
  if (isMobile) {
    return null
  }

  const effectiveVolume = isMuted ? 0 : volume

  const getVolumeIcon = () => {
    if (isMuted || volume === 0) {
      return <VolumeX className="w-6 h-6" />
    }
    if (volume < 0.5) {
      return <Volume1 className="w-6 h-6" />
    }
    return <Volume2 className="w-6 h-6" />
  }

  const calculateVolumeFromPositionY = (clientY: number): number => {
    if (!sliderRef.current) return volume
    const rect = sliderRef.current.getBoundingClientRect()
    const percent = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    return percent
  }

  const handleSliderMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    const newVolume = calculateVolumeFromPositionY(e.clientY)
    onVolumeChange(newVolume)

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const newVolume = calculateVolumeFromPositionY(e.clientY)
      onVolumeChange(newVolume)
    }

    const handleGlobalMouseUp = () => {
      setIsDragging(false)
      document.removeEventListener("mousemove", handleGlobalMouseMove)
      document.removeEventListener("mouseup", handleGlobalMouseUp)
    }

    document.addEventListener("mousemove", handleGlobalMouseMove)
    document.addEventListener("mouseup", handleGlobalMouseUp)
  }

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

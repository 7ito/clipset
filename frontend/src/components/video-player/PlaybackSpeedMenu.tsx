import { useState, useRef, useEffect } from "react"
import { Settings } from "lucide-react"
import { SpeedBottomSheet } from "./SpeedBottomSheet"

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.matchMedia("(max-width: 768px)").matches)
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])
  
  return isMobile
}

interface PlaybackSpeedMenuProps {
  currentRate: number
  onRateChange: (rate: number) => void
}

export function PlaybackSpeedMenu({
  currentRate,
  onRateChange
}: PlaybackSpeedMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen || isMobile) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen, isMobile])

  // Close on escape
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false)
      }
    }

    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [isOpen])

  const formatRate = (rate: number): string => {
    return rate === 1 ? "Normal" : `${rate}x`
  }

  return (
    <div className="video-speed-menu" ref={menuRef}>
      <button
        className="video-control-button video-speed-button"
        onClick={() => setIsOpen(!isOpen)}
        title="Playback Speed"
      >
        {currentRate === 1 ? (
          <Settings className="w-6 h-6" />
        ) : (
          <span className="text-xs font-bold">{currentRate}x</span>
        )}
      </button>

      {isMobile && (
        <SpeedBottomSheet
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          currentRate={currentRate}
          onRateChange={onRateChange}
        />
      )}

      {!isMobile && isOpen && (
        <div className="video-speed-dropdown">
          <div className="video-speed-dropdown-header">
            Playback Speed
          </div>
          <div className="video-speed-dropdown-list">
            {PLAYBACK_RATES.map((rate) => (
              <button
                key={rate}
                className={`video-speed-option ${rate === currentRate ? "active" : ""}`}
                onClick={() => {
                  onRateChange(rate)
                  setIsOpen(false)
                }}
              >
                {formatRate(rate)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

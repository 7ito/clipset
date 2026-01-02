import { useState, useRef, useEffect } from "react"
import { Settings, Check } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

interface PlaybackSpeedMenuProps {
  currentRate: number
  onRateChange: (rate: number) => void
  isMobile?: boolean
}

export function PlaybackSpeedMenu({
  currentRate,
  onRateChange,
  isMobile = false
}: PlaybackSpeedMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside (desktop only)
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
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
        title="Playback Speed"
      >
        {currentRate === 1 ? (
          <Settings className="w-6 h-6" />
        ) : (
          <span className="text-xs font-bold">{currentRate}x</span>
        )}
      </button>

      {/* Mobile: Dialog */}
      {isMobile && (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent className="max-w-xs" showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>Playback Speed</DialogTitle>
            </DialogHeader>
            <div className="grid gap-1">
              {PLAYBACK_RATES.map((rate) => (
                <button
                  key={rate}
                  className={`flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
                    rate === currentRate 
                      ? "bg-primary text-primary-foreground" 
                      : "hover:bg-muted"
                  }`}
                  onClick={() => {
                    onRateChange(rate)
                    setIsOpen(false)
                  }}
                >
                  <span>{formatRate(rate)}</span>
                  {rate === currentRate && <Check className="w-4 h-4" />}
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Desktop: Dropdown */}
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

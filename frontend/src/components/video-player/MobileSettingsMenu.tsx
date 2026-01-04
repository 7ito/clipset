import { useState } from "react"
import { Settings, Check, ChevronRight, ChevronLeft, Maximize } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

type MenuView = "main" | "speed"

interface MobileSettingsMenuProps {
  currentRate: number
  onRateChange: (rate: number) => void
  onRequestFullscreen: () => void
  isFullscreen: boolean
}

export function MobileSettingsMenu({
  currentRate,
  onRateChange,
  onRequestFullscreen,
  isFullscreen
}: MobileSettingsMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [view, setView] = useState<MenuView>("main")

  const formatRate = (rate: number): string => {
    return rate === 1 ? "Normal" : `${rate}x`
  }

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    // Reset to main view when closing
    if (!open) {
      setView("main")
    }
  }

  const handleSpeedSelect = (rate: number) => {
    onRateChange(rate)
    setIsOpen(false)
    setView("main")
  }

  const handleFullscreenClick = () => {
    setIsOpen(false)
    setView("main")
    onRequestFullscreen()
  }

  return (
    <div className="video-speed-menu">
      <button
        className="video-control-button video-speed-button"
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(true)
        }}
        title="Settings"
      >
        <Settings className="w-6 h-6" />
      </button>

      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-xs" showCloseButton={false}>
          {view === "main" ? (
            <>
              <DialogHeader>
                <DialogTitle>Settings</DialogTitle>
              </DialogHeader>
              <div className="grid gap-1">
                {/* Playback Speed Option */}
                <button
                  className="flex items-center justify-between px-3 py-3 rounded-md text-sm transition-colors hover:bg-muted"
                  onClick={() => setView("speed")}
                >
                  <span>Playback Speed</span>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <span>{formatRate(currentRate)}</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </button>

                {/* Fullscreen Option */}
                <button
                  className="flex items-center justify-between px-3 py-3 rounded-md text-sm transition-colors hover:bg-muted"
                  onClick={handleFullscreenClick}
                >
                  <span>{isFullscreen ? "Exit Fullscreen" : "Fullscreen"}</span>
                  <Maximize className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <button
                  className="flex items-center gap-1 text-sm font-medium hover:text-muted-foreground transition-colors"
                  onClick={() => setView("main")}
                >
                  <ChevronLeft className="w-4 h-4" />
                  <DialogTitle className="text-base">Playback Speed</DialogTitle>
                </button>
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
                    onClick={() => handleSpeedSelect(rate)}
                  >
                    <span>{formatRate(rate)}</span>
                    {rate === currentRate && <Check className="w-4 h-4" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

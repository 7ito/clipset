import { Dialog as DialogPrimitive } from "radix-ui"

interface SpeedBottomSheetProps {
  isOpen: boolean
  onClose: () => void
  currentRate: number
  onRateChange: (rate: number) => void
}

export function SpeedBottomSheet({
  isOpen,
  onClose,
  currentRate,
  onRateChange
}: SpeedBottomSheetProps) {
  const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="speed-sheet-overlay" />
        <DialogPrimitive.Content className="speed-sheet-content">
          <div className="speed-sheet-header">
            Playback Speed
          </div>
          <div className="speed-sheet-options">
            {PLAYBACK_RATES.map((rate) => (
              <button
                key={rate}
                className={`speed-sheet-option ${rate === currentRate ? "active" : ""}`}
                onClick={() => {
                  onRateChange(rate)
                  onClose()
                }}
              >
                {rate === 1 ? "Normal" : `${rate}x`}
              </button>
            ))}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

interface ClickableTimestampProps {
  seconds: number
  display: string
  onSeek: (seconds: number) => void
}

export function ClickableTimestamp({ seconds, display, onSeek }: ClickableTimestampProps) {
  return (
    <button
      type="button"
      className="text-primary hover:underline font-medium cursor-pointer transition-colors"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onSeek(seconds)
      }}
      title={`Jump to ${display}`}
    >
      {display}
    </button>
  )
}

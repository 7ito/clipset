import { findTimestampsInText } from "@/lib/timestamps"
import { ClickableTimestamp } from "./ClickableTimestamp"

interface CommentContentProps {
  text: string
  onSeek: (seconds: number) => void
}

export function CommentContent({ text, onSeek }: CommentContentProps) {
  const timestamps = findTimestampsInText(text)

  if (timestamps.length === 0) {
    return <p className="text-sm whitespace-pre-wrap break-words">{text}</p>
  }

  const segments: React.ReactNode[] = []
  let lastIndex = 0

  timestamps.forEach((ts, index) => {
    // Add text before timestamp
    if (ts.start > lastIndex) {
      segments.push(text.slice(lastIndex, ts.start))
    }
    
    // Add clickable timestamp
    segments.push(
      <ClickableTimestamp
        key={`ts-${index}`}
        seconds={ts.seconds}
        display={ts.match}
        onSeek={onSeek}
      />
    )
    
    lastIndex = ts.end
  })

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push(text.slice(lastIndex))
  }

  return (
    <p className="text-sm whitespace-pre-wrap break-words">
      {segments}
    </p>
  )
}

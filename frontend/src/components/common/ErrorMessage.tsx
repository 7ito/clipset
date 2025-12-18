import { AlertCircle } from "lucide-react"

interface ErrorMessageProps {
  message: string
  retry?: () => void
}

export function ErrorMessage({ message, retry }: ErrorMessageProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] gap-4">
      <div className="flex items-center gap-2 text-destructive">
        <AlertCircle className="size-5" />
        <p className="text-sm font-medium">{message}</p>
      </div>
      {retry && (
        <button
          onClick={retry}
          className="text-sm text-primary hover:underline"
        >
          Try again
        </button>
      )}
    </div>
  )
}

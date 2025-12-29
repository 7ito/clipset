import { useState } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, X, FileVideo, Loader2, ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Upload } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { formatFileSize } from "@/lib/formatters"
import { cn } from "@/lib/utils"

export interface QueuedFile {
  id: string
  file: File
  title: string
  description: string
  previewUrl: string | null
  isGeneratingPreview: boolean
  status: "pending" | "uploading" | "processing" | "complete" | "failed"
  progress: number
  error?: string
  videoId?: string
}

interface BatchFileItemProps {
  item: QueuedFile
  index: number
  onTitleChange: (id: string, title: string) => void
  onDescriptionChange: (id: string, description: string) => void
  onRemove: (id: string) => void
  disabled?: boolean
  showNumber?: boolean
  titlePrefix?: string
}

export function BatchFileItem({
  item,
  index,
  onTitleChange,
  onDescriptionChange,
  onRemove,
  disabled = false,
  showNumber = false,
  titlePrefix = ""
}: BatchFileItemProps) {
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id, disabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  // Determine the display title
  const displayTitle = titlePrefix ? `${titlePrefix} ${index + 1}` : item.title

  // Status colors and icons
  const statusConfig = {
    pending: { icon: null, color: "text-muted-foreground", bg: "" },
    uploading: { icon: Upload, color: "text-primary", bg: "bg-primary/5" },
    processing: { icon: Loader2, color: "text-blue-500", bg: "bg-blue-500/5" },
    complete: { icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/5" },
    failed: { icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/5" }
  }

  const status = statusConfig[item.status]
  const StatusIcon = status.icon

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "border rounded-lg transition-all",
        isDragging && "opacity-50 shadow-lg",
        status.bg,
        item.status === "failed" && "border-destructive/50"
      )}
    >
      <div className="flex items-center gap-3 p-3">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className={cn(
            "touch-none p-1 rounded hover:bg-accent cursor-grab active:cursor-grabbing",
            disabled && "opacity-30 cursor-not-allowed"
          )}
          disabled={disabled}
        >
          <GripVertical className="w-5 h-5 text-muted-foreground" />
        </button>

        {/* Thumbnail */}
        <div className="w-16 h-12 rounded overflow-hidden bg-muted flex-shrink-0 relative">
          {item.isGeneratingPreview ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
            </div>
          ) : item.previewUrl ? (
            <img
              src={item.previewUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <FileVideo className="w-5 h-5 text-muted-foreground/50" />
            </div>
          )}
        </div>

        {/* Title & Info */}
        <div className="flex-1 min-w-0 space-y-1">
          {showNumber && titlePrefix ? (
            // When using title prefix, show the generated title as read-only
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">
                #{index + 1}
              </span>
              <span className="font-medium truncate">{displayTitle}</span>
            </div>
          ) : (
            // Editable title field
            <Input
              value={item.title}
              onChange={(e) => onTitleChange(item.id, e.target.value)}
              placeholder="Enter title..."
              className="h-8 text-sm"
              disabled={disabled || item.status !== "pending"}
              maxLength={200}
            />
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatFileSize(item.file.size)}</span>
            <span>•</span>
            <span className="truncate">{item.file.name}</span>
          </div>
        </div>

        {/* Status Indicator */}
        {StatusIcon && (
          <div className={cn("flex items-center gap-1", status.color)}>
            <StatusIcon className={cn("w-4 h-4", item.status === "uploading" || item.status === "processing" ? "animate-spin" : "")} />
            {item.status === "uploading" && (
              <span className="text-xs font-medium">{item.progress}%</span>
            )}
          </div>
        )}

        {/* Expand Description Button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
          disabled={disabled || item.status !== "pending"}
        >
          {isDescriptionExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </Button>

        {/* Remove Button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(item.id)}
          disabled={disabled || item.status === "uploading" || item.status === "processing"}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Upload Progress Bar */}
      {item.status === "uploading" && (
        <div className="px-3 pb-3">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error Message */}
      {item.status === "failed" && item.error && (
        <div className="px-3 pb-3">
          <p className="text-xs text-destructive">{item.error}</p>
        </div>
      )}

      {/* Expanded Description */}
      {isDescriptionExpanded && item.status === "pending" && (
        <div className="px-3 pb-3 pt-0">
          <Textarea
            value={item.description}
            onChange={(e) => onDescriptionChange(item.id, e.target.value)}
            placeholder="Add a description for this video (optional)"
            className="text-sm resize-none"
            rows={2}
            maxLength={2000}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  )
}

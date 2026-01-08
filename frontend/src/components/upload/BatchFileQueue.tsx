import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from "@dnd-kit/sortable"
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BatchFileItem, type QueuedFile } from "./BatchFileItem"

interface BatchFileQueueProps {
  files: QueuedFile[]
  onFilesChange: (files: QueuedFile[]) => void
  onClearAll: () => void
  disabled?: boolean
  titlePrefix?: string
  titleMode?: "individual" | "prefix"
}

export function BatchFileQueue({
  files,
  onFilesChange,
  onClearAll,
  disabled = false,
  titlePrefix = "",
  titleMode = "individual"
}: BatchFileQueueProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = files.findIndex((f) => f.id === active.id)
      const newIndex = files.findIndex((f) => f.id === over.id)
      onFilesChange(arrayMove(files, oldIndex, newIndex))
    }
  }

  const handleTitleChange = (id: string, title: string) => {
    onFilesChange(
      files.map((f) => (f.id === id ? { ...f, title } : f))
    )
  }

  const handleDescriptionChange = (id: string, description: string) => {
    onFilesChange(
      files.map((f) => (f.id === id ? { ...f, description } : f))
    )
  }

  const handleRemove = (id: string) => {
    const file = files.find((f) => f.id === id)
    if (file?.previewUrl) {
      URL.revokeObjectURL(file.previewUrl)
    }
    onFilesChange(files.filter((f) => f.id !== id))
  }

  // Count files by status
  const pendingCount = files.filter((f) => f.status === "pending").length
  const completedCount = files.filter((f) => f.status === "complete").length
  const failedCount = files.filter((f) => f.status === "failed").length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold">
            {files.length} {files.length === 1 ? "file" : "files"} selected
          </h3>
          {completedCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-500">
              {completedCount} complete
            </span>
          )}
          {failedCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
              {failedCount} failed
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearAll}
          disabled={disabled}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Clear All
        </Button>
      </div>

      {/* Drag hint */}
      {pendingCount > 1 && !disabled && (
        <p className="text-xs text-muted-foreground">
          Drag to reorder. Videos will be uploaded in this order.
        </p>
      )}

      {/* File List */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      >
        <SortableContext
          items={files.map((f) => f.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {files.map((file, index) => (
              <BatchFileItem
                key={file.id}
                item={file}
                index={index}
                onTitleChange={handleTitleChange}
                onDescriptionChange={handleDescriptionChange}
                onRemove={handleRemove}
                disabled={disabled}
                titlePrefix={titlePrefix}
                titleMode={titleMode}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

import { Link } from "@tanstack/react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Trash2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { reorderPlaylistVideos } from "@/api/playlists"
import { toast } from "@/lib/toast"
import type { PlaylistVideo } from "@/types/playlist"

interface DraggablePlaylistVideosProps {
  playlistId: string
  videos: PlaylistVideo[]
  onRemove: (videoId: string) => void
  isRemoving: boolean
}

export function DraggablePlaylistVideos({
  playlistId,
  videos,
  onRemove,
  isRemoving
}: DraggablePlaylistVideosProps) {
  const queryClient = useQueryClient()
  
  // Set up sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Reorder mutation with optimistic updates
  const reorderMutation = useMutation({
    mutationFn: (videoPositions: Array<{ video_id: string; position: number }>) => 
      reorderPlaylistVideos(playlistId, videoPositions),
    onMutate: async (videoPositions) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["playlist", playlistId] })
      
      // Snapshot the previous value
      const previousData = queryClient.getQueryData(["playlist", playlistId])
      
      // Optimistically update to the new value
      queryClient.setQueryData(["playlist", playlistId], (old: any) => {
        if (!old) return old
        
        // Create a new videos array with updated positions
        const reorderedVideos = [...old.videos]
        videoPositions.forEach(({ video_id, position }: { video_id: string; position: number }) => {
          const index = reorderedVideos.findIndex((pv: any) => pv.video_id === video_id)
          if (index !== -1) {
            reorderedVideos[index] = { ...reorderedVideos[index], position }
          }
        })
        
        // Sort by position
        reorderedVideos.sort((a: any, b: any) => a.position - b.position)
        
        return { ...old, videos: reorderedVideos }
      })
      
      return { previousData }
    },
    onError: (error: any, _videoPositions, context) => {
      // Revert on error
      if (context?.previousData) {
        queryClient.setQueryData(["playlist", playlistId], context.previousData)
      }
      toast.error(error.response?.data?.detail || "Failed to reorder videos")
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: ["playlist", playlistId] })
    }
  })

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) {
      return
    }

    const oldIndex = videos.findIndex(v => v.id === active.id)
    const newIndex = videos.findIndex(v => v.id === over.id)

    if (oldIndex === -1 || newIndex === -1) {
      return
    }

    // Create new order
    const reorderedVideos = arrayMove(videos, oldIndex, newIndex)
    
    // Build position updates (0-indexed positions)
    const videoPositions = reorderedVideos.map((pv, index) => ({
      video_id: pv.video_id,
      position: index
    }))

    // Execute mutation
    reorderMutation.mutate(videoPositions)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={videos.map(v => v.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-3">
          {videos.map((pv, index) => (
            <SortableVideoItem
              key={pv.id}
              playlistVideo={pv}
              index={index}
              onRemove={onRemove}
              isRemoving={isRemoving}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

// Individual sortable video item
function SortableVideoItem({
  playlistVideo,
  index,
  onRemove,
  isRemoving
}: {
  playlistVideo: PlaylistVideo
  index: number
  onRemove: (videoId: string) => void
  isRemoving: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: playlistVideo.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`p-4 ${isDragging ? 'shadow-lg z-50' : ''}`}
    >
      <div className="flex items-center gap-4">
        {/* Drag handle */}
        <button
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none flex-shrink-0"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-5 h-5" />
        </button>

        {/* Position number */}
        <div className="text-2xl font-bold text-muted-foreground w-8 text-center flex-shrink-0">
          {index + 1}
        </div>

        {/* Thumbnail */}
        <div className="w-32 h-20 bg-muted rounded flex-shrink-0 overflow-hidden">
          {playlistVideo.video.thumbnail_filename && (
            <img 
              src={`/api/videos/${playlistVideo.video_id}/thumbnail`}
              alt={playlistVideo.video.title}
              className="w-full h-full object-cover rounded"
            />
          )}
        </div>

        {/* Video info */}
        <div className="flex-1 min-w-0">
          <Link 
            to="/videos/$id" 
            params={{ id: playlistVideo.video_id }}
            className="font-semibold hover:text-primary transition-colors line-clamp-1"
          >
            {playlistVideo.video.title}
          </Link>
          <p className="text-sm text-muted-foreground line-clamp-1">
            {playlistVideo.video.uploader_username}
          </p>
        </div>

        {/* Remove button */}
        <Button 
          variant="ghost" 
          size="sm" 
          className="flex-shrink-0"
          onClick={() => onRemove(playlistVideo.video_id)}
          disabled={isRemoving}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  )
}

import { useState, useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { MessageSquare, SortAsc, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CommentInput } from "./CommentInput"
import { CommentItem } from "./CommentItem"
import { EditCommentDialog } from "./EditCommentDialog"
import { getVideoComments, getCommentMarkers } from "@/api/comments"
import type { Comment, CommentMarker } from "@/types/comment"
import type { VideoPlayerRef } from "@/components/video-player"
import type { TimestampMarker } from "@/components/video-player/ProgressBar"

interface CommentSectionProps {
  videoId: string
  videoOwnerId: string
  playerRef: React.RefObject<VideoPlayerRef>
  onMarkersChange?: (markers: TimestampMarker[]) => void
  showMarkers: boolean
  onShowMarkersChange: (show: boolean) => void
}

export function CommentSection({
  videoId,
  videoOwnerId,
  playerRef,
  onMarkersChange,
  showMarkers,
  onShowMarkersChange
}: CommentSectionProps) {
  const [sort, setSort] = useState<"newest" | "oldest" | "timestamp">("newest")
  const [editingComment, setEditingComment] = useState<Comment | null>(null)
  
  // Fetch comments
  const { data, isLoading, isError } = useQuery({
    queryKey: ["comments", videoId, sort],
    queryFn: () => getVideoComments(videoId, { sort })
  })

  // Fetch markers
  const { data: markersData } = useQuery({
    queryKey: ["comment-markers", videoId],
    queryFn: () => getCommentMarkers(videoId)
  })

  // Update parent with markers whenever they change
  useEffect(() => {
    if (markersData && Array.isArray(markersData) && onMarkersChange) {
      const markers: TimestampMarker[] = markersData.map(m => ({
        seconds: m.seconds,
        label: `Comment at ${m.seconds}s`
      }))
      onMarkersChange(markers)
    }
  }, [markersData, onMarkersChange])

  const handleSeek = (seconds: number) => {
    if (playerRef.current) {
      playerRef.current.seekTo(seconds)
      playerRef.current.play()
      // Scroll to player
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }

  const getCurrentTime = () => {
    return playerRef.current?.getCurrentTime() || 0
  }

  return (
    <div className="space-y-8 mt-8 border-t pt-8 pb-16">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            <h2 className="text-xl font-bold">
              {data?.total || 0} {data?.total === 1 ? "Comment" : "Comments"}
            </h2>
          </div>
          
          <div className="flex items-center gap-2 ml-4">
            <Switch 
              id="show-markers" 
              checked={showMarkers} 
              onCheckedChange={onShowMarkersChange} 
            />
            <Label htmlFor="show-markers" className="text-xs cursor-pointer text-muted-foreground">
              Video Markers
            </Label>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <SortAsc className="w-4 h-4 text-muted-foreground" />
          <Select value={sort} onValueChange={(value: any) => setSort(value)}>
            <SelectTrigger className="w-[140px] h-8 text-xs border-none bg-accent/30 rounded-full focus:ring-0">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="timestamp">By Timestamp</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main Input */}
      <div className="bg-accent/10 p-4 rounded-2xl">
        <CommentInput 
          videoId={videoId} 
          currentTime={getCurrentTime()}
          placeholder="What do you think about this video?"
        />
      </div>

      {/* Comment List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="text-center py-12 text-muted-foreground">
            Failed to load comments.
          </div>
        ) : !data?.comments || data.comments.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-accent/5 rounded-2xl border-2 border-dashed">
            No comments yet. Be the first to start the conversation!
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {data.comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                videoOwnerId={videoOwnerId}
                onSeek={handleSeek}
                onEdit={setEditingComment}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <EditCommentDialog
        comment={editingComment}
        isOpen={!!editingComment}
        onClose={() => setEditingComment(null)}
      />
    </div>
  )
}

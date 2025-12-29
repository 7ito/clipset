import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { MessageSquare, SortAsc, Loader2 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CommentInput } from "./CommentInput"
import { CommentItem } from "./CommentItem"
import { EditCommentDialog } from "./EditCommentDialog"
import { getVideoComments } from "@/api/comments"
import type { Comment } from "@/types/comment"
import type { VideoPlayerRef } from "@/components/video-player"

interface CommentSectionProps {
  videoId: string
  videoOwnerId: string
  playerRef: React.RefObject<VideoPlayerRef | null>
}

export function CommentSection({
  videoId,
  videoOwnerId,
  playerRef
}: CommentSectionProps) {
  const [sort, setSort] = useState<"newest" | "oldest" | "timestamp">("newest")
  const [editingComment, setEditingComment] = useState<Comment | null>(null)
  
  // Fetch comments
  const { data, isLoading, isError } = useQuery({
    queryKey: ["comments", videoId, sort],
    queryFn: () => getVideoComments(videoId, { sort })
  })

  const handleSeek = (seconds: number) => {
    if (playerRef.current) {
      playerRef.current.seekTo(seconds)
      playerRef.current.play()
      // Scroll to player
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
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
      <div className="bg-accent/10 p-4 rounded-none">
        <CommentInput 
          videoId={videoId} 
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
          <div className="text-center py-12 text-muted-foreground bg-accent/5 rounded-none border-2 border-dashed">
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

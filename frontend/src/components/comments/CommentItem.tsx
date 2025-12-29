import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { MoreVertical, Edit2, Trash2, Reply, ChevronDown, ChevronUp, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/shared/UserAvatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { CommentContent } from "./CommentContent"
import { CommentInput } from "./CommentInput"
import { formatUploadDate } from "@/lib/formatters"
import { formatTimestamp } from "@/lib/timestamps"
import { deleteComment } from "@/api/comments"
import { toast } from "@/lib/toast"
import type { Comment } from "@/types/comment"

interface CommentItemProps {
  comment: Comment
  videoOwnerId: string
  onSeek: (seconds: number) => void
  onEdit: (comment: Comment) => void
  depth?: number
}

export function CommentItem({
  comment,
  videoOwnerId,
  onSeek,
  onEdit,
  depth = 0
}: CommentItemProps) {
  const queryClient = useQueryClient()
  const [showReplyInput, setShowReplyInput] = useState(false)
  const [showReplies, setShowReplies] = useState(true)

  const deleteMutation = useMutation({
    mutationFn: () => deleteComment(comment.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", comment.video_id] })
      queryClient.invalidateQueries({ queryKey: ["comment-markers", comment.video_id] })
      toast.success("Comment deleted")
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Failed to delete comment")
    }
  })

  return (
    <div className={`flex gap-3 ${depth > 0 ? "mt-4" : "mt-6"}`}>
      <Link to="/profile/$username" params={{ username: comment.author_username }} className="shrink-0">
        <UserAvatar
          username={comment.author_username}
          avatarUrl={comment.author_avatar_url || undefined}
          size={depth > 0 ? "sm" : "md"}
        />
      </Link>
      
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
            <Link 
              to="/profile/$username" 
              params={{ username: comment.author_username }}
              className="text-sm font-bold hover:text-primary transition-colors"
            >
              @{comment.author_username}
            </Link>
            <span className="text-[10px] text-muted-foreground">
              {formatUploadDate(comment.created_at)}
            </span>
            {comment.is_edited && (
              <span className="text-[10px] text-muted-foreground italic">(edited)</span>
            )}
            {comment.author_id === videoOwnerId && (
              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                Owner
              </span>
            )}
            {comment.timestamp_seconds !== null && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[10px] text-primary hover:text-primary hover:bg-primary/10 rounded-md font-medium"
                onClick={() => onSeek(comment.timestamp_seconds!)}
              >
                <Clock className="w-3 h-3 mr-1" />
                {formatTimestamp(comment.timestamp_seconds)}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1">
            {(comment.can_edit || comment.can_delete) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {comment.can_edit && (
                    <DropdownMenuItem onClick={() => onEdit(comment)}>
                      <Edit2 className="w-4 h-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  {comment.can_delete && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Comment</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete this comment? This action cannot be undone.
                            {comment.reply_count > 0 && " All replies will also be deleted."}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => deleteMutation.mutate()}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <CommentContent text={comment.content} onSeek={onSeek} />

        <div className="flex items-center gap-4 mt-1">
          {depth === 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground rounded-full"
              onClick={() => setShowReplyInput(!showReplyInput)}
            >
              <Reply className="w-3.5 h-3.5 mr-1" />
              Reply
            </Button>
          )}
        </div>

        {showReplyInput && (
          <div className="mt-3">
            <CommentInput
              videoId={comment.video_id}
              parentId={comment.id}
              placeholder={`Reply to @${comment.author_username}...`}
              onSuccess={() => {
                setShowReplyInput(false)
                setShowReplies(true)
              }}
              onCancel={() => setShowReplyInput(false)}
              autoFocus
            />
          </div>
        )}

        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-2 space-y-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-primary hover:text-primary hover:bg-primary/10 rounded-full"
              onClick={() => setShowReplies(!showReplies)}
            >
              {showReplies ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
              {showReplies ? "Hide" : `Show ${comment.reply_count} ${comment.reply_count === 1 ? "reply" : "replies"}`}
            </Button>

            {showReplies && comment.replies && (
              <div className="pl-2 border-l-2 border-muted">
                {comment.replies.map((reply) => (
                  <CommentItem
                    key={reply.id}
                    comment={reply}
                    videoOwnerId={videoOwnerId}
                    onSeek={onSeek}
                    onEdit={onEdit}
                    depth={depth + 1}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

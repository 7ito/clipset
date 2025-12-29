import { useState, useRef, useEffect } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Send, Clock, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { UserAvatar } from "@/components/shared/UserAvatar"
import { useAuth } from "@/hooks/useAuth"
import { createComment } from "@/api/comments"
import { toast } from "@/lib/toast"
import { formatTimestamp, findTimestampsInText } from "@/lib/timestamps"
import type { Comment } from "@/types/comment"

interface CommentInputProps {
  videoId: string
  parentId?: string
  currentTime?: number
  onSuccess?: (comment: Comment) => void
  onCancel?: () => void
  autoFocus?: boolean
  placeholder?: string
}

export function CommentInput({
  videoId,
  parentId,
  currentTime,
  onSuccess,
  onCancel,
  autoFocus = false,
  placeholder = "Add a comment..."
}: CommentInputProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [content, setContent] = useState("")
  const [detectedTimestamps, setDetectedTimestamps] = useState<string[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [autoFocus])

  useEffect(() => {
    const found = findTimestampsInText(content)
    setDetectedTimestamps(found.map(f => f.match))
  }, [content])

  const mutation = useMutation({
    mutationFn: () => createComment(videoId, {
      content: content.trim(),
      parent_id: parentId,
      timestamp_seconds: parentId ? undefined : undefined // We could extract first timestamp if we wanted, but let's keep it manual or implicit
    }),
    onSuccess: (newComment) => {
      setContent("")
      queryClient.invalidateQueries({ queryKey: ["comments", videoId] })
      queryClient.invalidateQueries({ queryKey: ["comment-markers", videoId] })
      toast.success(parentId ? "Reply posted" : "Comment posted")
      if (onSuccess) onSuccess(newComment)
    },
    error: (error: any) => {
      toast.error(error.response?.data?.detail || "Failed to post comment")
    }
  })

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!content.trim() || mutation.isPending) return
    mutation.mutate()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleSubmit()
    }
  }

  const insertTimestamp = () => {
    if (currentTime === undefined) return
    const timestamp = formatTimestamp(currentTime)
    const prefix = content && !content.endsWith(" ") ? " " : ""
    setContent(prev => prev + prefix + timestamp + " ")
    textareaRef.current?.focus()
  }

  if (!user) return null

  return (
    <div className="flex gap-4">
      <UserAvatar 
        username={user.username} 
        avatarUrl={user.avatar_filename ? `/media/avatars/${user.avatar_filename}` : undefined}
        size="sm"
        className="mt-1 shrink-0"
      />
      <div className="flex-1 space-y-2">
        <form onSubmit={handleSubmit} className="relative">
          <Textarea
            ref={textareaRef}
            placeholder={placeholder}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[80px] pr-12 pb-10 resize-none rounded-xl bg-accent/20 border-none focus-visible:ring-1 focus-visible:ring-primary/50"
            maxLength={2000}
          />
          
          <div className="absolute left-3 bottom-3 flex items-center gap-2">
            {currentTime !== undefined && !parentId && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full"
                onClick={insertTimestamp}
                title="Add current video time"
              >
                <Clock className="w-3.5 h-3.5 mr-1" />
                {formatTimestamp(currentTime)}
              </Button>
            )}
            
            {detectedTimestamps.length > 0 && (
              <span className="text-[10px] text-muted-foreground bg-accent/50 px-2 py-0.5 rounded-full">
                Timestamps detected
              </span>
            )}
          </div>

          <div className="absolute right-3 bottom-3 flex items-center gap-2">
            {onCancel && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-full"
                onClick={onCancel}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
            <Button
              type="submit"
              size="sm"
              className="h-8 w-8 p-0 rounded-full"
              disabled={!content.trim() || mutation.isPending}
            >
              {mutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </form>
        <div className="flex justify-between items-center px-1">
          <p className="text-[10px] text-muted-foreground">
            {content.length}/2000 characters • Ctrl+Enter to post
          </p>
        </div>
      </div>
    </div>
  )
}

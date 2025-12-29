import { useState, useEffect } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { updateComment } from "@/api/comments"
import { toast } from "@/lib/toast"
import type { Comment } from "@/types/comment"

interface EditCommentDialogProps {
  comment: Comment | null
  isOpen: boolean
  onClose: () => void
}

export function EditCommentDialog({ comment, isOpen, onClose }: EditCommentDialogProps) {
  const queryClient = useQueryClient()
  const [content, setContent] = useState("")

  useEffect(() => {
    if (comment) {
      setContent(comment.content)
    }
  }, [comment])

  const mutation = useMutation({
    mutationFn: (newContent: string) => updateComment(comment!.id, { content: newContent }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", comment?.video_id] })
      toast.success("Comment updated")
      onClose()
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Failed to update comment")
    }
  })

  const handleSave = () => {
    if (!content.trim() || mutation.isPending) return
    mutation.mutate(content.trim())
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Comment</DialogTitle>
          <DialogDescription>
            You can edit your comment within 24 hours of posting.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[120px] resize-none"
            placeholder="Edit your comment..."
            maxLength={2000}
          />
          <p className="text-[10px] text-muted-foreground mt-2 text-right">
            {content.length}/2000 characters
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!content.trim() || mutation.isPending}>
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

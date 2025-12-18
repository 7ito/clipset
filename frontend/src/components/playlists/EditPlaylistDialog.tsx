import { useState, useEffect } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { updatePlaylist } from "@/api/playlists"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/lib/toast"
import type { PlaylistUpdate, PlaylistWithVideos } from "@/types/playlist"

interface EditPlaylistDialogProps {
  isOpen: boolean
  onClose: () => void
  playlist: PlaylistWithVideos
}

export function EditPlaylistDialog({ isOpen, onClose, playlist }: EditPlaylistDialogProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(playlist.name)
  const [description, setDescription] = useState(playlist.description || "")

  // Update form when playlist changes
  useEffect(() => {
    if (isOpen) {
      setName(playlist.name)
      setDescription(playlist.description || "")
    }
  }, [isOpen, playlist])

  const updateMutation = useMutation({
    mutationFn: (data: PlaylistUpdate) => updatePlaylist(playlist.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlist", playlist.id] })
      queryClient.invalidateQueries({ queryKey: ["playlists"] })
      toast.success("Playlist updated successfully")
      handleClose()
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Failed to update playlist")
    }
  })

  const handleClose = () => {
    onClose()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      toast.error("Please enter a playlist name")
      return
    }

    // Only send fields that changed
    const updates: PlaylistUpdate = {}
    if (name.trim() !== playlist.name) {
      updates.name = name.trim()
    }
    if (description.trim() !== (playlist.description || "")) {
      updates.description = description.trim() || undefined
    }

    // If nothing changed, just close
    if (Object.keys(updates).length === 0) {
      handleClose()
      return
    }

    updateMutation.mutate(updates)
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Playlist</DialogTitle>
          <DialogDescription>
            Update your playlist name or description
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Favorite Videos"
              maxLength={200}
              disabled={updateMutation.isPending}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A collection of my favorite moments..."
              maxLength={1000}
              rows={3}
              disabled={updateMutation.isPending}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {description.length}/1000 characters
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={updateMutation.isPending || !name.trim()}
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

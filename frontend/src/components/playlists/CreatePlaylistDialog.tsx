import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createPlaylist } from "@/api/playlists"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/lib/toast"
import type { PlaylistCreate } from "@/types/playlist"

interface CreatePlaylistDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function CreatePlaylistDialog({ isOpen, onClose }: CreatePlaylistDialogProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  const createMutation = useMutation({
    mutationFn: (data: PlaylistCreate) => createPlaylist(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] })
      toast.success("Playlist created successfully")
      handleClose()
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Failed to create playlist")
    }
  })

  const handleClose = () => {
    setName("")
    setDescription("")
    onClose()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      toast.error("Please enter a playlist name")
      return
    }

    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Playlist</DialogTitle>
          <DialogDescription>
            Create a playlist to organize your favorite videos
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Favorite Videos"
              maxLength={200}
              disabled={createMutation.isPending}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A collection of my favorite moments..."
              maxLength={1000}
              rows={3}
              disabled={createMutation.isPending}
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
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || !name.trim()}
            >
              {createMutation.isPending ? "Creating..." : "Create Playlist"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

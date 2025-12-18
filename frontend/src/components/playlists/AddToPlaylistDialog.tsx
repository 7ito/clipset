import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ListPlus, Plus } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import { getUserPlaylists, addVideoToPlaylist, removeVideoFromPlaylist } from "@/api/playlists"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/shared/LoadingSpinner"
import { EmptyState } from "@/components/shared/EmptyState"
import { CreatePlaylistDialog } from "./CreatePlaylistDialog"
import { toast } from "@/lib/toast"

interface AddToPlaylistDialogProps {
  isOpen: boolean
  onClose: () => void
  videoId: string
  videoTitle: string
}

export function AddToPlaylistDialog({ isOpen, onClose, videoId, videoTitle }: AddToPlaylistDialogProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [selectedPlaylists, setSelectedPlaylists] = useState<Set<string>>(new Set())
  const [initialPlaylists, setInitialPlaylists] = useState<Set<string>>(new Set())
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)

  // Fetch user's playlists with status for this video
  const { data, isLoading, error } = useQuery({
    queryKey: ["playlists", "for-video", videoId, user?.username],
    queryFn: () => {
      if (!user) throw new Error("Not authenticated")
      return getUserPlaylists(videoId)
    },
    enabled: isOpen && !!user
  })

  // Initialize selected playlists when data loads
  useEffect(() => {
    if (data && data.playlists) {
      // For now, getUserPlaylists doesn't return which playlists contain the video
      // We'll need to check each playlist or enhance the API
      // For simplicity, we'll start with none selected and let users toggle
      setSelectedPlaylists(new Set())
      setInitialPlaylists(new Set())
    }
  }, [data])

  // Save changes mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const toAdd = Array.from(selectedPlaylists).filter(id => !initialPlaylists.has(id))
      const toRemove = Array.from(initialPlaylists).filter(id => !selectedPlaylists.has(id))

      const results = await Promise.allSettled([
        ...toAdd.map(playlistId => addVideoToPlaylist(playlistId, videoId)),
        ...toRemove.map(playlistId => removeVideoFromPlaylist(playlistId, videoId))
      ])

      const failures = results.filter(r => r.status === 'rejected')
      if (failures.length > 0) {
        throw new Error(`Failed to update ${failures.length} playlist(s)`)
      }

      return { added: toAdd.length, removed: toRemove.length }
    },
    onSuccess: ({ added, removed }) => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] })
      
      if (added > 0 && removed > 0) {
        toast.success(`Updated ${added + removed} playlist(s)`)
      } else if (added > 0) {
        toast.success(`Added to ${added} playlist${added !== 1 ? 's' : ''}`)
      } else if (removed > 0) {
        toast.success(`Removed from ${removed} playlist${removed !== 1 ? 's' : ''}`)
      }
      
      handleClose()
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update playlists")
    }
  })

  const handleClose = () => {
    setSelectedPlaylists(new Set())
    setInitialPlaylists(new Set())
    onClose()
  }

  const handleTogglePlaylist = (playlistId: string) => {
    const newSelected = new Set(selectedPlaylists)
    if (newSelected.has(playlistId)) {
      newSelected.delete(playlistId)
    } else {
      newSelected.add(playlistId)
    }
    setSelectedPlaylists(newSelected)
  }

  const handleSave = () => {
    if (selectedPlaylists.size === 0 && initialPlaylists.size === 0) {
      handleClose()
      return
    }
    saveMutation.mutate()
  }

  const handleCreatePlaylist = () => {
    setIsCreateDialogOpen(true)
  }

  const handleCreateComplete = () => {
    setIsCreateDialogOpen(false)
    // Refetch playlists
    queryClient.invalidateQueries({ queryKey: ["playlists", "for-video", videoId] })
  }

  const hasChanges = 
    selectedPlaylists.size !== initialPlaylists.size ||
    Array.from(selectedPlaylists).some(id => !initialPlaylists.has(id))

  return (
    <>
      <Dialog open={isOpen && !isCreateDialogOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add to Playlist</DialogTitle>
            <DialogDescription>
              Save "{videoTitle}" to your playlists
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-[200px] max-h-[400px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : error ? (
              <EmptyState
                icon={ListPlus}
                title="Failed to load playlists"
                description="There was an error loading your playlists"
              />
            ) : !data || data.playlists.length === 0 ? (
              <EmptyState
                icon={ListPlus}
                title="No playlists yet"
                description="Create your first playlist to get started"
                action={{
                  label: "Create Playlist",
                  onClick: handleCreatePlaylist
                }}
              />
            ) : (
              <div className="space-y-2">
                {data.playlists.map((playlist) => {
                  const isSelected = selectedPlaylists.has(playlist.id)
                  
                  return (
                    <button
                      key={playlist.id}
                      onClick={() => handleTogglePlaylist(playlist.id)}
                      className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-muted hover:border-primary/50 hover:bg-accent'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div 
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                            isSelected 
                              ? 'bg-primary border-primary' 
                              : 'bg-background border-muted-foreground'
                          }`}
                        >
                          {isSelected && (
                            <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold line-clamp-1">{playlist.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {playlist.video_count} {playlist.video_count === 1 ? 'video' : 'videos'}
                          </p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Create new playlist button */}
          {data && data.playlists.length > 0 && (
            <Button
              variant="outline"
              onClick={handleCreatePlaylist}
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create New Playlist
            </Button>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={saveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nested create playlist dialog */}
      <CreatePlaylistDialog
        isOpen={isCreateDialogOpen}
        onClose={handleCreateComplete}
      />
    </>
  )
}

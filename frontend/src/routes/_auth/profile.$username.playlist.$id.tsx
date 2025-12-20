import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { ArrowLeft, Edit, Trash2, ListVideo } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import { getPlaylist, deletePlaylist, removeVideoFromPlaylist } from "@/api/playlists"
import { getThumbnailUrl } from "@/api/videos"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { LoadingSpinner } from "@/components/shared/LoadingSpinner"
import { EmptyState } from "@/components/shared/EmptyState"
import { EditPlaylistDialog } from "@/components/playlists/EditPlaylistDialog"
import { AddVideosDialog } from "@/components/playlists/AddVideosDialog"
import { DraggablePlaylistVideos } from "@/components/playlists/DraggablePlaylistVideos"
import { toast } from "@/lib/toast"

export const Route = createFileRoute("/_auth/profile/$username/playlist/$id")({
  component: PlaylistDetailPage
})

function generateGradient(name: string): string {
  const gradients = [
    "from-blue-500 to-purple-600",
    "from-green-500 to-teal-600",
    "from-orange-500 to-red-600",
    "from-pink-500 to-rose-600",
    "from-indigo-500 to-blue-600",
    "from-yellow-500 to-orange-600",
    "from-cyan-500 to-blue-600",
    "from-violet-500 to-purple-600",
  ]
  
  const index = name.charCodeAt(0) % gradients.length
  return gradients[index]
}

function PlaylistDetailPage() {
  const { username, id } = Route.useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isAddVideosDialogOpen, setIsAddVideosDialogOpen] = useState(false)

  // Fetch playlist with videos
  const { data: playlist, isLoading, error } = useQuery({
    queryKey: ["playlist", id],
    queryFn: () => getPlaylist(id)
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => deletePlaylist(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] })
      toast.success("Playlist deleted successfully")
      navigate({ to: "/profile/$username", params: { username } })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Failed to delete playlist")
    }
  })

  // Remove video mutation
  const removeMutation = useMutation({
    mutationFn: (videoId: string) => removeVideoFromPlaylist(id, videoId),
    onMutate: async (videoId) => {
      // Optimistically remove video from UI
      await queryClient.cancelQueries({ queryKey: ["playlist", id] })
      const previousData = queryClient.getQueryData(["playlist", id])
      
      queryClient.setQueryData(["playlist", id], (old: any) => {
        if (!old) return old
        return {
          ...old,
          videos: old.videos.filter((pv: any) => pv.video_id !== videoId),
          video_count: old.video_count - 1
        }
      })
      
      return { previousData }
    },
    onError: (error: any, _videoId, context) => {
      // Revert on error
      if (context?.previousData) {
        queryClient.setQueryData(["playlist", id], context.previousData)
      }
      toast.error(error.response?.data?.detail || "Failed to remove video")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlist", id] })
      queryClient.invalidateQueries({ queryKey: ["playlists"] })
      toast.success("Video removed from playlist")
    }
  })

  const isOwner = user?.username === username

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    )
  }

  // Error state
  if (error || !playlist) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="p-8 text-center max-w-md">
          <EmptyState
            icon={ListVideo}
            title="Playlist Not Found"
            description="This playlist doesn't exist or has been deleted."
          />
          <Button asChild variant="outline" className="mt-4">
            <Link to="/profile/$username" params={{ username }}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Profile
            </Link>
          </Button>
        </Card>
      </div>
    )
  }

  const gradient = generateGradient(playlist.name)
  const coverImage = playlist.first_video_thumbnail 
    ? getThumbnailUrl(playlist.first_video_thumbnail) 
    : null

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Back button */}
      <Button asChild variant="ghost" size="sm">
        <Link to="/profile/$username" params={{ username }}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to {username}'s Profile
        </Link>
      </Button>

      {/* Playlist Header */}
      <div className="flex flex-col md:flex-row gap-6">
        {/* Cover Image */}
        <div className="aspect-square w-full md:w-48 rounded-lg overflow-hidden flex-shrink-0">
          {coverImage ? (
            <img src={coverImage} alt={playlist.name} className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
              <ListVideo className="w-16 h-16 text-white/30" />
            </div>
          )}
        </div>

        {/* Playlist Info */}
        <div className="flex-1 space-y-4">
          <div>
            <h1 className="text-3xl font-bold">{playlist.name}</h1>
            <p className="text-muted-foreground mt-1">
              by <Link 
                to="/profile/$username" 
                params={{ username: playlist.creator_username }}
                className="hover:text-primary transition-colors"
              >
                {playlist.creator_username}
              </Link>
            </p>
          </div>

          {playlist.description && (
            <p className="text-muted-foreground">{playlist.description}</p>
          )}

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ListVideo className="w-4 h-4" />
            <span>{playlist.video_count} {playlist.video_count === 1 ? "video" : "videos"}</span>
          </div>

          {/* Action buttons (owner only) */}
          {isOwner && (
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setIsEditDialogOpen(true)}>
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Videos Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Videos</h2>
          {isOwner && (
            <Button onClick={() => setIsAddVideosDialogOpen(true)}>Add Videos</Button>
          )}
        </div>

        {playlist.videos.length === 0 ? (
          <EmptyState
            icon={ListVideo}
            title="No videos in this playlist"
            description={isOwner ? "Add videos to get started!" : "This playlist is empty."}
            action={
              isOwner
                ? {
                    label: "Add Videos",
                    onClick: () => setIsAddVideosDialogOpen(true)
                  }
                : undefined
            }
          />
        ) : isOwner ? (
          // Draggable list for owners
          <DraggablePlaylistVideos
            playlistId={playlist.id}
            videos={playlist.videos}
            onRemove={(videoId) => removeMutation.mutate(videoId)}
            isRemoving={removeMutation.isPending}
          />
        ) : (
          // Static list for viewers
          <div className="space-y-3">
            {playlist.videos.map((pv, index) => (
              <Card key={pv.id} className="p-4">
                <div className="flex items-center gap-4">
                  {/* Position number */}
                  <div className="text-2xl font-bold text-muted-foreground w-8 text-center flex-shrink-0">
                    {index + 1}
                  </div>

                  {/* Thumbnail */}
                  <div className="w-32 h-20 bg-muted rounded flex-shrink-0 overflow-hidden">
                    {pv.video.thumbnail_filename && (
                      <img 
                        src={getThumbnailUrl(pv.video.thumbnail_filename)}
                        alt={pv.video.title}
                        className="w-full h-full object-cover rounded"
                      />
                    )}
                  </div>

                  {/* Video info */}
                  <div className="flex-1 min-w-0">
                    <Link 
                      to="/videos/$id" 
                      params={{ id: pv.video_id }}
                      search={{ playlistId: id }}
                      className="font-semibold hover:text-primary transition-colors line-clamp-1"
                    >
                      {pv.video.title}
                    </Link>
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {pv.video.uploader_username}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit playlist dialog */}
      {isOwner && (
        <EditPlaylistDialog
          isOpen={isEditDialogOpen}
          onClose={() => setIsEditDialogOpen(false)}
          playlist={playlist}
        />
      )}

      {/* Add videos dialog */}
      {isOwner && (
        <AddVideosDialog
          isOpen={isAddVideosDialogOpen}
          onClose={() => setIsAddVideosDialogOpen(false)}
          playlist={playlist}
        />
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Playlist</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{playlist.name}"? This action cannot be undone.
              The videos will not be deleted, only the playlist.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Playlist"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Edit, Trash2, Eye, Calendar, Folder, FileVideo, Loader2, ArrowLeft, ListPlus, ChevronRight, ChevronLeft, Link as LinkIcon } from "lucide-react"
import { getVideo, deleteVideo, updateVideo, incrementViewCount, getVideoStreamUrl, getThumbnailUrl } from "@/api/videos"
import { getPlaylist } from "@/api/playlists"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { toast } from "@/lib/toast"
import { copyToClipboard } from "@/lib/clipboard"
import { formatDuration, formatUploadDate, getStatusColor } from "@/lib/formatters"
import { useAuth } from "@/hooks/useAuth"
import { LoadingPage } from "@/components/shared/LoadingSpinner"
import { AddToPlaylistDialog } from "@/components/playlists/AddToPlaylistDialog"
import { PlaylistQueue } from "@/components/playlists/PlaylistQueue"

export const Route = createFileRoute("/_auth/videos/$id")({
  component: VideoPlayerPage,
  validateSearch: (search: Record<string, unknown>): { playlistId?: string } => {
    return {
      playlistId: (search.playlistId as string) || undefined,
    }
  },
})

function Description({ text }: { text: string }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isLong = text.length > 300

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="font-semibold mb-2">Description</h3>
        <p className={`text-sm text-muted-foreground whitespace-pre-wrap ${!isExpanded && isLong ? "line-clamp-3" : ""}`}>
          {text}
        </p>
        {isLong && (
          <Button 
            variant="link" 
            size="sm" 
            className="p-0 h-auto mt-2 text-primary hover:text-primary/80"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? "Show less" : "Show more"}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function VideoPlayerPage() {
  const { id } = Route.useParams()
  const { playlistId } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [editTitle, setEditTitle] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [hasIncrementedView, setHasIncrementedView] = useState(false)
  const [isAddToPlaylistOpen, setIsAddToPlaylistOpen] = useState(false)
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true)
  const [nextCountdown, setNextCountdown] = useState<number | null>(null)

  // Fetch video
  const { data: video, isLoading, refetch } = useQuery({
    queryKey: ["videos", id],
    queryFn: () => getVideo(id)
  })

  // Fetch playlist if context exists
  const { data: playlist } = useQuery({
    queryKey: ["playlist", playlistId],
    queryFn: () => getPlaylist(playlistId!),
    enabled: !!playlistId
  })

  // Poll for status updates if video is processing
  useEffect(() => {
    if (video && (video.processing_status === "pending" || video.processing_status === "processing")) {
      const interval = setInterval(() => {
        refetch()
      }, 3000)
      return () => clearInterval(interval)
    }
  }, [video, refetch])

  // Autoplay countdown logic
  useEffect(() => {
    let timer: any
    if (nextCountdown !== null && nextCountdown > 0) {
      timer = setTimeout(() => setNextCountdown(nextCountdown - 1), 1000)
    } else if (nextCountdown === 0) {
      if (playlist) {
        const currentIndex = playlist.videos.findIndex(v => v.video_id === id)
        if (currentIndex !== -1) {
          let nextIndex = currentIndex + 1
          if (nextIndex >= playlist.videos.length) {
            nextIndex = 0 // Loop back to start
          }
          const nextVideo = playlist.videos[nextIndex]
          setNextCountdown(null)
          navigate({ 
            to: "/videos/$id", 
            params: { id: nextVideo.video_id },
            search: { playlistId }
          })
        }
      }
    }
    return () => clearTimeout(timer)
  }, [nextCountdown, playlist, id, navigate, playlistId])

  // Reset countdown if video changes manually
  useEffect(() => {
    setNextCountdown(null)
  }, [id])

  const handleVideoEnded = () => {
    if (!autoPlayEnabled || !playlist || playlist.videos.length <= 1) return
    setNextCountdown(3)
  }

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: { title: string, description?: string }) =>
      updateVideo(id, data),
    onSuccess: () => {
      toast.success("Video updated successfully")
      setEditDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ["videos", id] })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Failed to update video")
    }
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => deleteVideo(id),
    onSuccess: () => {
      toast.success("Video deleted successfully")
      queryClient.invalidateQueries({ queryKey: ["videos"] })
      navigate({ to: "/dashboard" })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Failed to delete video")
    }
  })

  // Increment view count on video play
  const handleVideoPlay = () => {
    if (!hasIncrementedView && video?.processing_status === "completed") {
      incrementViewCount(id).then(() => {
        setHasIncrementedView(true)
        queryClient.invalidateQueries({ queryKey: ["videos", id] })
      })
    }
  }

  const handleEditClick = () => {
    if (video) {
      setEditTitle(video.title)
      setEditDescription(video.description || "")
      setEditDialogOpen(true)
    }
  }

  const handleEditSubmit = () => {
    updateMutation.mutate({
      title: editTitle.trim(),
      description: editDescription.trim() || undefined
    })
  }

  if (isLoading) {
    return <LoadingPage text="Loading video..." />
  }

  if (!video) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="inline-flex p-6 rounded-full bg-muted mb-6">
          <FileVideo className="w-16 h-16 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Video not found</h2>
        <p className="text-muted-foreground mb-8">
          The video you're looking for doesn't exist or has been removed
        </p>
        <Link to="/dashboard">
          <Button>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Link>
      </div>
    )
  }

  const isOwner = user?.id === video.uploaded_by
  const isAdmin = user?.role === "admin"
  const canEdit = isOwner || isAdmin
  const statusColor = getStatusColor(video.processing_status)

  return (
    <div className="max-w-6xl mx-auto px-4">
      <div className="space-y-6">
        {/* Video Player */}
        <Card className="overflow-hidden border-none bg-black ring-1 ring-border">
          <CardContent className="p-0">
            {video.processing_status === "completed" ? (
              <video
                controls
                autoPlay
                className="w-full aspect-video"
                poster={video.thumbnail_filename ? getThumbnailUrl(id) : undefined}
                onPlay={handleVideoPlay}
                onEnded={handleVideoEnded}
              >
                <source src={getVideoStreamUrl(id)} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            ) : (
              <div className="w-full aspect-video bg-gradient-to-br from-muted/20 to-muted/5 flex items-center justify-center">
                <div className="text-center space-y-6 p-8">
                  {video.processing_status === "pending" || video.processing_status === "processing" ? (
                    <>
                      <div className="inline-flex p-6 rounded-full bg-primary/10">
                        <Loader2 className="w-16 h-16 animate-spin text-primary" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-xl font-semibold capitalize">{video.processing_status}...</p>
                        <p className="text-sm text-muted-foreground max-w-md">
                          Your video is being processed. This may take a few minutes depending on the file size.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="inline-flex p-6 rounded-full bg-destructive/10">
                        <FileVideo className="w-16 h-16 text-destructive" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-xl font-semibold text-destructive">Processing Failed</p>
                        <p className="text-sm text-muted-foreground max-w-md">
                          {video.error_message || "An error occurred while processing this video"}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Video Info */}
        <div className="space-y-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold leading-tight line-clamp-2">{video.title}</h1>
              </div>
              <div className="flex gap-2 shrink-0">
                {playlist && (
                  <div className="flex items-center gap-1 mr-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-none"
                      disabled={playlist.videos.findIndex(v => v.video_id === id) === 0 && playlist.videos.length > 1}
                      onClick={() => {
                        const currentIndex = playlist.videos.findIndex(v => v.video_id === id)
                        const prevIndex = currentIndex === 0 ? playlist.videos.length - 1 : currentIndex - 1
                        navigate({
                          to: "/videos/$id",
                          params: { id: playlist.videos[prevIndex].video_id },
                          search: { playlistId }
                        })
                      }}
                      title="Previous Video"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-none"
                      onClick={() => {
                        const currentIndex = playlist.videos.findIndex(v => v.video_id === id)
                        const nextIndex = (currentIndex + 1) % playlist.videos.length
                        navigate({
                          to: "/videos/$id",
                          params: { id: playlist.videos[nextIndex].video_id },
                          search: { playlistId }
                        })
                      }}
                      title="Next Video"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                )}
                {video.processing_status !== "completed" && (
                  <Badge 
                    variant={statusColor === "green" ? "default" : "secondary"} 
                    className="capitalize"
                  >
                    {video.processing_status}
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 py-2 border-y">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Eye className="w-4 h-4" />
                  <span>{video.view_count.toLocaleString()} {video.view_count === 1 ? "view" : "views"}</span>
                </div>
                <span>•</span>
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  <span>{formatUploadDate(video.created_at)}</span>
                </div>
                {video.duration_seconds !== null && (
                  <>
                    <span>•</span>
                    <span>{formatDuration(video.duration_seconds)}</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={() => copyToClipboard(window.location.href)}
                  className="rounded-full"
                >
                  <LinkIcon className="w-4 h-4 mr-2" />
                  Copy Link
                </Button>

                {video.processing_status === "completed" && (
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    onClick={() => setIsAddToPlaylistOpen(true)}
                    className="rounded-full"
                  >
                    <ListPlus className="w-4 h-4 mr-2" />
                    Save
                  </Button>
                )}

                {canEdit && (
                  <div className="flex items-center gap-1 border-l pl-2 ml-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={handleEditClick}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-destructive hover:text-destructive hover:bg-destructive/10">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Video</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{video.title}"? This action cannot be undone.
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
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Uploader Info */}
          <div className="flex items-center justify-between p-4 bg-accent/30 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                {video.uploader_username.charAt(0).toUpperCase()}
              </div>
              <div>
                <Link 
                  to="/profile/$username" 
                  params={{ username: video.uploader_username }}
                  className="font-bold hover:text-primary transition-colors"
                >
                  {video.uploader_username}
                </Link>
                <p className="text-xs text-muted-foreground">Uploader</p>
              </div>
            </div>
            {video.category_name && (
              <Link to="/dashboard" search={{ category_id: video.category_id || undefined }}>
                <Badge variant="outline" className="hover:bg-accent transition-colors cursor-pointer px-3 py-1">
                  <Folder className="w-3 h-3 mr-1.5 opacity-70" />
                  {video.category_name}
                </Badge>
              </Link>
            )}
          </div>

          {/* Description */}
          {video.description && (
            <Description text={video.description} />
          )}

          {/* Playlist Queue */}
          {playlist && (
            <PlaylistQueue
              playlist={playlist}
              currentVideoId={id}
              autoPlayEnabled={autoPlayEnabled}
              onAutoPlayToggle={setAutoPlayEnabled}
              nextCountdown={nextCountdown}
            />
          )}
        </div>
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Video</DialogTitle>
            <DialogDescription>Update video title and description</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={4}
                maxLength={2000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditSubmit} disabled={!editTitle.trim()}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add to Playlist Dialog */}
      <AddToPlaylistDialog
        isOpen={isAddToPlaylistOpen}
        onClose={() => setIsAddToPlaylistOpen(false)}
        videoId={id}
        videoTitle={video.title}
      />
    </div>
  )
}

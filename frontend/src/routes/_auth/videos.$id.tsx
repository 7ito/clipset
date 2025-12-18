import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Edit, Trash2, Eye, Calendar, User, Folder, FileVideo, Loader2, ArrowLeft, ListPlus } from "lucide-react"
import { getVideo, deleteVideo, updateVideo, incrementViewCount, getVideoStreamUrl, getThumbnailUrl } from "@/api/videos"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { toast } from "@/lib/toast"
import { formatDuration, formatUploadDate, formatFileSize, getStatusColor } from "@/lib/formatters"
import { useAuth } from "@/hooks/useAuth"
import { LoadingPage } from "@/components/shared/LoadingSpinner"
import { AddToPlaylistDialog } from "@/components/playlists/AddToPlaylistDialog"

export const Route = createFileRoute("/_auth/videos/$id")({
  component: VideoPlayerPage
})

function VideoPlayerPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [editTitle, setEditTitle] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [hasIncrementedView, setHasIncrementedView] = useState(false)
  const [isAddToPlaylistOpen, setIsAddToPlaylistOpen] = useState(false)

  // Fetch video
  const { data: video, isLoading, refetch } = useQuery({
    queryKey: ["videos", id],
    queryFn: () => getVideo(id)
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
    <div className="space-y-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Main Video Player */}
        <div className="space-y-6">
          {/* Video Player */}
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {video.processing_status === "completed" ? (
                <video
                  controls
                  className="w-full aspect-video bg-black"
                  poster={video.thumbnail_filename ? getThumbnailUrl(id) : undefined}
                  onPlay={handleVideoPlay}
                >
                  <source src={getVideoStreamUrl(id)} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              ) : (
                <div className="w-full aspect-video bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
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
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-3 mb-3">
                  <h1 className="text-2xl sm:text-3xl font-bold leading-tight flex-1">{video.title}</h1>
                  <Badge 
                    variant={statusColor === "green" ? "default" : "secondary"} 
                    className="capitalize shrink-0"
                  >
                    {video.processing_status}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    <span className="font-medium">{video.view_count}</span>
                    <span>{video.view_count === 1 ? "view" : "views"}</span>
                  </div>
                  <span>•</span>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>{formatUploadDate(video.created_at)}</span>
                  </div>
                  {video.duration_seconds !== null && (
                    <>
                      <span>•</span>
                      <span>{formatDuration(video.duration_seconds)}</span>
                    </>
                  )}
                  <span>•</span>
                  <span>{formatFileSize(video.file_size_bytes)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {/* Add to Playlist button - available for completed videos */}
                {video.processing_status === "completed" && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setIsAddToPlaylistOpen(true)}
                  >
                    <ListPlus className="w-4 h-4 mr-2" />
                    Add to Playlist
                  </Button>
                )}

                {/* Edit and Delete - only for owners/admins */}
                {canEdit && (
                  <>
                    <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" onClick={handleEditClick}>
                          <Edit className="w-4 h-4" />
                        </Button>
                      </DialogTrigger>
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

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
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
                  </>
                )}
              </div>
            </div>

            {/* Description */}
            {video.description && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-2">Description</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{video.description}</p>
                </CardContent>
              </Card>
            )}

            {/* Metadata */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Uploaded by</span>
                  <Link 
                    to="/profile/$username" 
                    params={{ username: video.uploader_username }}
                    className="font-medium hover:text-primary transition-colors"
                  >
                    {video.uploader_username}
                  </Link>
                </div>
                {video.category_name && (
                  <div className="flex items-center gap-2 text-sm">
                    <Folder className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Category</span>
                    <Link to="/dashboard" search={{ category_id: video.category_id || undefined }}>
                      <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                        {video.category_name}
                      </Badge>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

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

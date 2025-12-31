import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useEffect, useState, useRef, useCallback } from "react"
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
import { ShareDialog } from "@/components/video-player/ShareDialog"
import { formatDuration, formatUploadDate, getStatusColor } from "@/lib/formatters"
import { parseTimestamp } from "@/lib/timestamps"
import { useAuth } from "@/hooks/useAuth"
import { LoadingPage } from "@/components/shared/LoadingSpinner"
import { AddToPlaylistDialog } from "@/components/playlists/AddToPlaylistDialog"
import { PlaylistQueue } from "@/components/playlists/PlaylistQueue"
import { VideoPlayer, type VideoPlayerRef } from "@/components/video-player"
import { CommentSection } from "@/components/comments/CommentSection"

export const Route = createFileRoute("/_auth/v/$shortId")({
  component: VideoPlayerPage,
  validateSearch: (search: Record<string, unknown>): { playlist?: string; t?: number } => {
    // Parse timestamp from URL
    const tParam = search.t
    let timestamp: number | undefined

    if (typeof tParam === "string") {
      timestamp = parseTimestamp(tParam) ?? undefined
    } else if (typeof tParam === "number") {
      timestamp = tParam
    }

    return {
      playlist: (search.playlist as string) || undefined,
      t: timestamp
    }
  },
})

function DescriptionContent({ text }: { text: string }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isLong = text.length > 300

  return (
    <div className="space-y-2">
      <p className={`text-sm text-foreground/90 whitespace-pre-wrap ${!isExpanded && isLong ? "line-clamp-3" : ""}`}>
        {text}
      </p>
      {isLong && (
        <Button 
          variant="link" 
          size="sm" 
          className="p-0 h-auto text-primary hover:text-primary/80 font-semibold"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? "Show less" : "Show more"}
        </Button>
      )}
    </div>
  )
}

function VideoPlayerPage() {
  const { shortId } = Route.useParams()
  const { playlist: playlistShortId, t: initialTimestamp } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [editTitle, setEditTitle] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [hasIncrementedView, setHasIncrementedView] = useState(false)
  const [isAddToPlaylistOpen, setIsAddToPlaylistOpen] = useState(false)
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true)
  const [nextCountdown, setNextCountdown] = useState<number | null>(null)
  const [currentPlayerTime, setCurrentPlayerTime] = useState(0)
  
  const playerRef = useRef<VideoPlayerRef>(null)

  // Fetch video
  const { data: video, isLoading, refetch } = useQuery({
    queryKey: ["videos", shortId],
    queryFn: () => getVideo(shortId)
  })

  // Fetch playlist if context exists (using short_id)
  const { data: playlist } = useQuery({
    queryKey: ["playlist", playlistShortId],
    queryFn: () => getPlaylist(playlistShortId!),
    enabled: !!playlistShortId
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
    let timer: ReturnType<typeof setTimeout>
    if (nextCountdown !== null && nextCountdown > 0) {
      timer = setTimeout(() => setNextCountdown(nextCountdown - 1), 1000)
    } else if (nextCountdown === 0) {
      if (playlist && video) {
        const currentIndex = playlist.videos.findIndex(v => v.video_id === video.id)
        if (currentIndex !== -1) {
          let nextIndex = currentIndex + 1
          if (nextIndex >= playlist.videos.length) {
            nextIndex = 0 // Loop back to start
          }
          const nextVideo = playlist.videos[nextIndex]
          setNextCountdown(null)
          navigate({ 
            to: "/v/$shortId", 
            params: { shortId: nextVideo.video.short_id },
            search: { playlist: playlistShortId }
          })
        }
      }
    }
    return () => clearTimeout(timer)
  }, [nextCountdown, playlist, video, navigate, playlistShortId])

  // Reset state when video changes
  useEffect(() => {
    setNextCountdown(null)
    setHasIncrementedView(false)
    setCurrentPlayerTime(0)
  }, [shortId])

  const handleVideoEnded = useCallback(() => {
    if (!autoPlayEnabled || !playlist || playlist.videos.length <= 1) return
    setNextCountdown(3)
  }, [autoPlayEnabled, playlist])

  // Increment view count on video play
  const handleVideoPlay = useCallback(() => {
    if (!hasIncrementedView && video?.processing_status === "completed") {
      incrementViewCount(shortId).then(() => {
        setHasIncrementedView(true)
        queryClient.invalidateQueries({ queryKey: ["videos", shortId] })
      })
    }
  }, [hasIncrementedView, video?.processing_status, shortId, queryClient])

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentPlayerTime(time)
  }, [])

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: { title: string, description?: string }) =>
      updateVideo(shortId, data),
    onSuccess: () => {
      toast.success("Video updated successfully")
      setEditDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ["videos", shortId] })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Failed to update video")
    }
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => deleteVideo(shortId),
    onSuccess: () => {
      toast.success("Video deleted successfully")
      queryClient.invalidateQueries({ queryKey: ["videos"] })
      navigate({ to: "/dashboard" })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Failed to delete video")
    }
  })

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
        <Card className="overflow-hidden border-none bg-black ring-1 ring-border rounded-none">
          <CardContent className="p-0">
            {video.processing_status === "completed" ? (
              <VideoPlayer
                ref={playerRef}
                src={getVideoStreamUrl(shortId)}
                 poster={video.thumbnail_filename ? getThumbnailUrl(video.thumbnail_filename) : undefined}
                 initialTime={initialTimestamp}
                 autoPlay={true}
                 onPlay={handleVideoPlay}
                 onEnded={handleVideoEnded}
                 onTimeUpdate={handleTimeUpdate}
               />
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
                      disabled={playlist.videos.findIndex(v => v.video_id === video.id) === 0 && playlist.videos.length > 1}
                      onClick={() => {
                        const currentIndex = playlist.videos.findIndex(v => v.video_id === video.id)
                        const prevIndex = currentIndex === 0 ? playlist.videos.length - 1 : currentIndex - 1
                        navigate({
                          to: "/v/$shortId",
                          params: { shortId: playlist.videos[prevIndex].video.short_id },
                          search: { playlist: playlistShortId }
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
                        const currentIndex = playlist.videos.findIndex(v => v.video_id === video.id)
                        const nextIndex = (currentIndex + 1) % playlist.videos.length
                        navigate({
                          to: "/v/$shortId",
                          params: { shortId: playlist.videos[nextIndex].video.short_id },
                          search: { playlist: playlistShortId }
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
                  onClick={() => setIsShareOpen(true)}
                  className="rounded-full"
                >
                  <LinkIcon className="w-4 h-4 mr-2" />
                  Share
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

          {/* Uploader & Description Section */}
          <div className="bg-accent/10 rounded-none p-4 space-y-4">
            <div className="flex items-center justify-between">
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
                  <Badge variant="outline" className="hover:bg-accent transition-colors cursor-pointer px-3 py-1 rounded-none border-primary/20 bg-primary/5">
                    <Folder className="w-3 h-3 mr-1.5 opacity-70" />
                    {video.category_name}
                  </Badge>
                </Link>
              )}
            </div>

            {video.description && (
              <div className="pt-2 border-t border-border/50">
                <DescriptionContent text={video.description} />
              </div>
            )}
          </div>

          {/* Playlist Queue */}
          {playlist && (
            <PlaylistQueue
              playlist={playlist}
              currentVideoId={video.id}
              autoPlayEnabled={autoPlayEnabled}
              onAutoPlayToggle={setAutoPlayEnabled}
              nextCountdown={nextCountdown}
            />
          )}

           {/* Comment Section */}
          <CommentSection
            videoId={video.id}
            videoOwnerId={video.uploaded_by}
            playerRef={playerRef}
          />
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
        videoId={video.id}
        videoTitle={video.title}
      />

      <ShareDialog
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        videoUrl={window.location.origin + "/v/" + video.short_id}
        currentTime={currentPlayerTime}
      />
    </div>
  )
}

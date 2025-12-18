import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { VideoIcon, ListPlus } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import { getVideos, getThumbnailUrl } from "@/api/videos"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState } from "@/components/shared/EmptyState"
import { VideoGridSkeleton } from "@/components/shared/VideoCardSkeleton"
import { PlaylistsTab } from "@/components/playlists/PlaylistsTab"
import { AddToPlaylistDialog } from "@/components/playlists/AddToPlaylistDialog"
import { formatFileSize, formatDuration, formatUploadDate, getStatusColor } from "@/lib/formatters"
import type { Video } from "@/types/video"

export const Route = createFileRoute("/_auth/profile/$username/")({
  component: ProfileIndexPage
})

  function VideoCard({ video }: { video: Video }) {
    const [isAddToPlaylistOpen, setIsAddToPlaylistOpen] = useState(false)
    
    const thumbnailUrl = video.thumbnail_filename
      ? getThumbnailUrl(video.thumbnail_filename)
      : "/placeholder-video.jpg"

  const statusColor = getStatusColor(video.processing_status)

  const handleAddToPlaylist = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsAddToPlaylistOpen(true)
  }

  return (
    <>
      <Link to={`/videos/${video.id}`} className="block group">
        <Card className="overflow-hidden hover:shadow-lg transition-all duration-200 hover:-translate-y-1">
          <div className="relative aspect-video bg-muted overflow-hidden">
            {video.thumbnail_filename ? (
              <img
                src={thumbnailUrl}
                alt={video.title}
                className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-gradient-to-br from-muted to-muted/50">
                <VideoIcon className="w-16 h-16 opacity-50" />
              </div>
            )}
            {video.duration_seconds !== null && video.processing_status === "completed" && (
              <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs font-medium px-2 py-1 rounded backdrop-blur-sm">
                {formatDuration(video.duration_seconds)}
              </div>
            )}
            <div className="absolute top-2 right-2">
              <Badge variant={statusColor === "green" ? "default" : "secondary"} className="capitalize backdrop-blur-sm bg-background/80">
                {video.processing_status}
              </Badge>
            </div>

            {/* Add to Playlist button */}
            {video.processing_status === "completed" && (
              <button
                onClick={handleAddToPlaylist}
                className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/90 backdrop-blur-sm hover:bg-background text-foreground p-2 rounded-md shadow-lg"
                title="Add to playlist"
              >
                <ListPlus className="w-4 h-4" />
              </button>
            )}
          </div>
          <CardContent className="p-4 space-y-2">
            <h3 className="font-semibold line-clamp-2 leading-snug group-hover:text-primary transition-colors">
              {video.title}
            </h3>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{formatUploadDate(video.created_at)}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              {video.view_count > 0 && (
                <>
                  <span>{video.view_count} {video.view_count === 1 ? "view" : "views"}</span>
                  <span>•</span>
                </>
              )}
              <span>{formatFileSize(video.file_size_bytes)}</span>
              {video.category_name && (
                <>
                  <span>•</span>
                  <Badge variant="outline" className="text-xs">
                    {video.category_name}
                  </Badge>
                </>
              )}
            </div>
            {video.processing_status === "failed" && video.error_message && (
              <p className="text-xs text-destructive line-clamp-1 pt-1">
                Error: {video.error_message}
              </p>
            )}
          </CardContent>
        </Card>
      </Link>

      <AddToPlaylistDialog
        isOpen={isAddToPlaylistOpen}
        onClose={() => setIsAddToPlaylistOpen(false)}
        videoId={video.id}
        videoTitle={video.title}
      />
    </>
  )
}

function ProfileIndexPage() {
  const { username } = Route.useParams()
  const { user: currentUser } = useAuth()
  const [skip, setSkip] = useState(0)
  const limit = 20

  // Get profileUser and isOwnProfile from parent layout context
  const routeContext = Route.useRouteContext()
  
  // Fetch user's videos
  const { data: videosData, isLoading: isLoadingVideos } = useQuery({
    queryKey: ["videos", "user", routeContext.profileUser?.id, skip],
    queryFn: () => getVideos({
      uploaded_by: routeContext.profileUser?.id,
      skip,
      limit
    }),
    enabled: !!routeContext.profileUser
  })

  const hasMoreVideos = videosData && videosData.total > skip + videosData.videos.length
  const profileUser = routeContext.profileUser
  const isOwnProfile = routeContext.isOwnProfile

  return (
    <Tabs defaultValue="videos" className="space-y-6">
      <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto">
        <TabsTrigger value="videos">Videos</TabsTrigger>
        <TabsTrigger value="playlists">Playlists</TabsTrigger>
      </TabsList>

      {/* Videos Tab */}
      <TabsContent value="videos" className="space-y-6">
        <h2 className="text-2xl font-semibold">Videos</h2>

        {isLoadingVideos ? (
          <VideoGridSkeleton count={8} />
        ) : videosData?.videos.length === 0 ? (
          <EmptyState
            icon={VideoIcon}
            title={isOwnProfile ? "No videos yet" : `${profileUser?.username} hasn't uploaded any videos yet`}
            description={
              isOwnProfile
                ? "You haven't uploaded any videos. Get started by uploading your first video!"
                : "Check back later to see their content."
            }
            action={
              isOwnProfile
                ? {
                  label: "Upload Video",
                  onClick: () => window.location.href = "/upload"
                }
                : undefined
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {videosData?.videos.map((video) => (
                <VideoCard key={video.id} video={video} />
              ))}
            </div>

            {/* Load More */}
            {hasMoreVideos && (
              <div className="flex justify-center pt-4">
                <Button onClick={() => setSkip(skip + limit)} variant="outline" size="lg">
                  Load More Videos
                </Button>
              </div>
            )}
          </>
        )}
      </TabsContent>

      {/* Playlists Tab */}
      <TabsContent value="playlists">
        <PlaylistsTab username={profileUser?.username || username} isOwnProfile={isOwnProfile || false} />
      </TabsContent>
    </Tabs>
  )
}

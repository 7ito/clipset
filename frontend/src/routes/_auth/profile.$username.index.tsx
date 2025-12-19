import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { VideoIcon } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import { getVideos } from "@/api/videos"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState } from "@/components/shared/EmptyState"
import { VideoGridSkeleton } from "@/components/shared/VideoCardSkeleton"
import { PlaylistsTab } from "@/components/playlists/PlaylistsTab"
import { VideoCard } from "@/components/shared/VideoCard"

export const Route = createFileRoute("/_auth/profile/$username/")({
  component: ProfileIndexPage
})

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
                <VideoCard key={video.id} video={video} showUploader={false} />
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

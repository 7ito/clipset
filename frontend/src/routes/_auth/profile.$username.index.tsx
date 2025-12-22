import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { VideoIcon } from "lucide-react"
import { getVideos } from "@/api/videos"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState } from "@/components/shared/EmptyState"
import { VideoGridSkeleton } from "@/components/shared/VideoCardSkeleton"
import { PlaylistsTab } from "@/components/playlists/PlaylistsTab"
import { VideoCard } from "@/components/shared/VideoCard"
import { useProfileContext } from "./profile.$username"

export const Route = createFileRoute("/_auth/profile/$username/")({
  component: ProfileIndexPage
})

function ProfileIndexPage() {
  const { username } = Route.useParams()
  const navigate = useNavigate()
  const [skip, setSkip] = useState(0)
  const limit = 20

  // Get profileUser and isOwnProfile from parent layout context
  const { profileUser, isOwnProfile } = useProfileContext()
  
  // Fetch user's videos
  const { data: videosData, isLoading: isLoadingVideos } = useQuery({
    queryKey: ["videos", "user", profileUser?.id, skip],
    queryFn: () => getVideos({
      uploaded_by: profileUser?.id,
      skip,
      limit
    }),
    enabled: !!profileUser,
    // Refetch every 5 seconds if there are videos being processed
    refetchInterval: (query) => {
      const videos = query.state.data?.videos
      if (!videos) return false
      
      const hasProcessing = videos.some(
        v => v.processing_status === "pending" || v.processing_status === "processing"
      )
      return hasProcessing ? 5000 : false
    }
  })

  const hasMoreVideos = videosData && videosData.total > skip + videosData.videos.length

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
                  onClick: () => navigate({ to: "/upload" })
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

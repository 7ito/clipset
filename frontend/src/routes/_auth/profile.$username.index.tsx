import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useInfiniteQuery } from "@tanstack/react-query"
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
  const limit = 20

  // Get profileUser and isOwnProfile from parent layout context
  const { profileUser, isOwnProfile } = useProfileContext()
  
  // Fetch user's videos with infinite scroll
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingVideos,
  } = useInfiniteQuery({
    queryKey: ["videos", "user", profileUser?.id],
    queryFn: ({ pageParam = 0 }) => getVideos({
      uploaded_by: profileUser?.id,
      skip: pageParam,
      limit
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const totalLoaded = allPages.reduce((sum, page) => sum + page.videos.length, 0)
      return totalLoaded < lastPage.total ? totalLoaded : undefined
    },
    enabled: !!profileUser,
    // Refetch every 5 seconds if there are videos being processed
    refetchInterval: (query) => {
      const pages = query.state.data?.pages
      if (!pages) return false
      
      const hasProcessing = pages.some(page =>
        page.videos.some(
          v => v.processing_status === "pending" || v.processing_status === "processing"
        )
      )
      return hasProcessing ? 5000 : false
    }
  })

  // Flatten all pages into a single array
  const allVideos = data?.pages.flatMap(page => page.videos) ?? []

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
        ) : allVideos.length === 0 ? (
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
              {allVideos.map((video) => (
                <VideoCard key={video.id} video={video} showUploader={false} />
              ))}
            </div>

            {/* Loading more skeleton */}
            {isFetchingNextPage && (
              <VideoGridSkeleton count={4} />
            )}

            {/* Load More */}
            {hasNextPage && !isFetchingNextPage && (
              <div className="flex justify-center pt-4">
                <Button onClick={() => fetchNextPage()} variant="outline" size="lg">
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

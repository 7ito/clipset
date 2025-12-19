import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Search, VideoIcon, ArrowLeft, ListPlus } from "lucide-react"
import { getVideos } from "@/api/videos"
import { getCategoryBySlug } from "@/api/categories"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { VideoCard } from "@/components/shared/VideoCard"
import { EmptyState } from "@/components/shared/EmptyState"
import { VideoGridSkeleton } from "@/components/shared/VideoCardSkeleton"
import { LoadingSpinner } from "@/components/shared/LoadingSpinner"

export const Route = createFileRoute("/_auth/categories/$slug")({
  component: CategoryPage
})

function CategoryPage() {
  const { slug } = Route.useParams()
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<"newest" | "views">("newest")

  // Fetch category details
  const { data: category, isLoading: categoryLoading, error: categoryError } = useQuery({
    queryKey: ["category", slug],
    queryFn: () => getCategoryBySlug(slug)
  })

  // Fetch videos for this category
  const { data: videosData, isLoading: videosLoading } = useQuery({
    queryKey: ["videos", "category", category?.id, { search, sortBy }],
    queryFn: () => getVideos({
      search: search || undefined,
      category_id: category?.id,
      skip: 0,
      limit: 100 // Get all videos for this category
    }),
    enabled: !!category?.id
  })

  // Client-side sorting
  const sortedVideos = videosData?.videos ? [...videosData.videos].sort((a, b) => {
    if (sortBy === "views") {
      return b.view_count - a.view_count
    }
    // Newest first (default)
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  }) : []

  // Category not found
  if (categoryError) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <div className="text-destructive">Category not found</div>
          <Button asChild variant="outline">
            <Link to="/categories">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Categories
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  // Loading category
  if (categoryLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    )
  }

  if (!category) {
    return null
  }

  // Generate gradient fallback
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
  const gradientIndex = category.name.charCodeAt(0) % gradients.length
  const gradient = gradients[gradientIndex]

  return (
    <div className="space-y-6">
      {/* Category Header */}
      <div className="space-y-4">
        {/* Back button */}
        <Button asChild variant="ghost" size="sm">
          <Link to="/categories">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Categories
          </Link>
        </Button>

        {/* Category Banner */}
        <div className="relative overflow-hidden rounded-lg border bg-card">
          <div className="flex flex-col md:flex-row gap-6 p-6">
            {/* Category Image */}
            <div className="flex-shrink-0">
              <div className="w-32 h-32 rounded-lg overflow-hidden">
                {category.image_url ? (
                  <img
                    src={category.image_url}
                    alt={category.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className={`w-full h-full bg-gradient-to-br ${gradient}`} />
                )}
              </div>
            </div>

            {/* Category Info */}
            <div className="flex-1 space-y-2">
              <h1 className="text-3xl font-bold">{category.name}</h1>
              {category.description && (
                <p className="text-muted-foreground">{category.description}</p>
              )}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{category.video_count} {category.video_count === 1 ? "video" : "videos"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Sort Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search videos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={sortBy} onValueChange={(value) => setSortBy(value as "newest" | "views")}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="views">Most Viewed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Videos Grid */}
      {videosLoading ? (
        <VideoGridSkeleton count={6} />
      ) : sortedVideos.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {sortedVideos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={VideoIcon}
          title={search ? "No videos found" : "No videos in this category yet"}
          description={search ? `No videos match "${search}"` : "Videos will appear here once they are uploaded"}
        />
      )}
    </div>
  )
}

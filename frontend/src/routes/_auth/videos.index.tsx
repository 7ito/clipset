import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Search, Upload as UploadIcon, VideoIcon } from "lucide-react"
import { getVideos, getThumbnailUrl } from "@/api/videos"
import { getCategories } from "@/api/categories"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDuration, formatUploadDate, formatFileSize, getStatusColor } from "@/lib/formatters"
import type { Video } from "@/types/video"
import { useAuth } from "@/hooks/useAuth"
import { PageHeader } from "@/components/shared/PageHeader"
import { EmptyState } from "@/components/shared/EmptyState"
import { VideoGridSkeleton } from "@/components/shared/VideoCardSkeleton"
import { useNavigate } from "@tanstack/react-router"

export const Route = createFileRoute("/_auth/videos/")({
  component: VideosPage
})

function VideoCard({ video }: { video: Video }) {
  const thumbnailUrl = video.thumbnail_filename
    ? getThumbnailUrl(video.id)
    : "/placeholder-video.jpg"

  const statusColor = getStatusColor(video.processing_status)

  return (
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
        </div>
        <CardContent className="p-4 space-y-2">
          <h3 className="font-semibold line-clamp-2 leading-snug group-hover:text-primary transition-colors">
            {video.title}
          </h3>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium">{video.uploader_username}</span>
            <span>•</span>
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
  )
}

function VideosPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("")
  const [skip, setSkip] = useState(0)
  const limit = 20

  // Fetch videos
  const { data: videosData, isLoading } = useQuery({
    queryKey: ["videos", { search, category_id: categoryFilter, skip, limit }],
    queryFn: () => getVideos({
      search: search || undefined,
      category_id: categoryFilter || undefined,
      skip,
      limit
    })
  })

  // Fetch categories for filter
  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories
  })

  const handleSearchChange = (value: string) => {
    setSearch(value)
    setSkip(0) // Reset to first page when searching
  }

  const handleCategoryChange = (value: string) => {
    setCategoryFilter(value === "__all__" ? "" : value)
    setSkip(0) // Reset to first page when filtering
  }

  const handleLoadMore = () => {
    setSkip(skip + limit)
  }

  const hasMore = videosData && videosData.total > skip + videosData.videos.length

  return (
    <div className="space-y-8">
      <PageHeader
        title="Videos"
        description={`${videosData?.total || 0} video${videosData?.total === 1 ? "" : "s"} available`}
        action={
          <Link to="/upload">
            <Button size="default">
              <UploadIcon className="w-4 h-4 mr-2" />
              Upload Video
            </Button>
          </Link>
        }
      />

      {/* Filters */}
      <Card className="p-4">
        <div className="flex gap-4 flex-col sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search videos by title..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={categoryFilter || "__all__"} onValueChange={handleCategoryChange}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Categories</SelectItem>
              {categoriesData?.categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Videos Grid */}
      {isLoading ? (
        <VideoGridSkeleton count={8} />
      ) : videosData?.videos.length === 0 ? (
        <EmptyState
          icon={search || categoryFilter ? Search : VideoIcon}
          title={search || categoryFilter ? "No videos found" : "No videos yet"}
          description={
            search || categoryFilter
              ? "Try adjusting your search or filters to find what you're looking for."
              : "Be the first to upload a video and share it with the community!"
          }
          action={
            !search && !categoryFilter
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
              <VideoCard key={video.id} video={video} />
            ))}
          </div>

          {/* Load More */}
          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button onClick={handleLoadMore} variant="outline" size="lg">
                Load More Videos
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

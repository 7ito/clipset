import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Search, VideoIcon, ListPlus } from "lucide-react"
import { getVideos, getThumbnailUrl } from "@/api/videos"
import { getCategories } from "@/api/categories"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDuration, formatUploadDate, formatFileSize, getStatusColor } from "@/lib/formatters"
import { AddToPlaylistDialog } from "@/components/playlists/AddToPlaylistDialog"
import type { Video } from "@/types/video"
import { PageHeader } from "@/components/shared/PageHeader"
import { EmptyState } from "@/components/shared/EmptyState"
import { VideoGridSkeleton } from "@/components/shared/VideoCardSkeleton"

export const Route = createFileRoute("/_auth/dashboard")({
  component: DashboardPage
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
              <Link 
                to="/profile/$username" 
                params={{ username: video.uploader_username }}
                className="font-medium hover:text-primary transition-colors"
              >
                {video.uploader_username}
              </Link>
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

      <AddToPlaylistDialog
        isOpen={isAddToPlaylistOpen}
        onClose={() => setIsAddToPlaylistOpen(false)}
        videoId={video.id}
        videoTitle={video.title}
      />
    </>
  )
}

function DashboardPage() {
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("")
  const [sortBy, setSortBy] = useState<"newest" | "views">("newest")
  const [skip, setSkip] = useState(0)
  const limit = 20

  // Fetch all community videos
  const { data: videosData, isLoading } = useQuery({
    queryKey: ["videos", "community", { search, category_id: categoryFilter, sortBy, skip, limit }],
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

  // Client-side sorting (since backend doesn't support sort param yet)
  const sortedVideos = videosData?.videos ? [...videosData.videos].sort((a, b) => {
    if (sortBy === "views") {
      return b.view_count - a.view_count
    }
    // Newest first (default)
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  }) : []

  const handleSearchChange = (value: string) => {
    setSearch(value)
    setSkip(0)
  }

  const handleCategoryChange = (value: string) => {
    setCategoryFilter(value === "__all__" ? "" : value)
    setSkip(0)
  }

  const handleSortChange = (value: string) => {
    setSortBy(value as "newest" | "views")
    setSkip(0)
  }

  const handleLoadMore = () => {
    setSkip(skip + limit)
  }

  const hasMore = videosData && videosData.total > skip + videosData.videos.length

  return (
    <div className="space-y-8">
      <PageHeader
        title="Home"
        description={`${videosData?.total || 0} video${videosData?.total === 1 ? "" : "s"} from the community`}
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
            <SelectTrigger className="w-full sm:w-[180px]">
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
          <Select value={sortBy} onValueChange={handleSortChange}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="views">Most Viewed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Videos Grid */}
      {isLoading ? (
        <VideoGridSkeleton count={8} />
      ) : sortedVideos.length === 0 ? (
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
                  onClick: () => window.location.href = "/upload"
                }
              : undefined
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {sortedVideos.map((video) => (
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

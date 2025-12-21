import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Search, VideoIcon } from "lucide-react"
import { getVideos } from "@/api/videos"
import { getCategories } from "@/api/categories"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { VideoCard } from "@/components/shared/VideoCard"
import { PageHeader } from "@/components/shared/PageHeader"
import { EmptyState } from "@/components/shared/EmptyState"
import { VideoGridSkeleton } from "@/components/shared/VideoCardSkeleton"

export const Route = createFileRoute("/_auth/dashboard")({
  component: DashboardPage
})

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
    }),
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

      {/* Unified Filter Bar */}
      <div className="flex flex-col md:flex-row md:h-11 items-stretch gap-0 border border-border bg-card/50 backdrop-blur-sm shadow-sm group/filterbar focus-within:border-primary/50 transition-all duration-300 dark:bg-card/50 bg-white/80">
        <div className="flex-1 flex items-stretch relative border-b md:border-b-0 md:border-r border-border focus-within:bg-card transition-colors min-w-0 h-11 md:h-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40 group-focus-within/filterbar:text-primary transition-colors pointer-events-none z-10" />
          <Input
            placeholder="Search videos by title..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10 !h-full border-none bg-transparent focus-visible:ring-0 placeholder:text-foreground/40 text-[13px] font-medium w-full"
          />
        </div>
        
        <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-border shrink-0 items-stretch md:h-full">
          <div className="w-full sm:w-[240px] flex items-stretch h-11 sm:h-auto md:h-full">
            <Select value={categoryFilter || "__all__"} onValueChange={handleCategoryChange}>
              <SelectTrigger className="!h-full border-none bg-muted/20 sm:bg-transparent focus:ring-0 hover:bg-muted/30 sm:hover:bg-transparent text-[12px] font-semibold px-4 w-full rounded-none flex items-center justify-between flex-1">
                <span className="text-[10px] uppercase tracking-wider font-bold text-foreground/30 shrink-0">Category</span>
                <div className="flex-1 flex justify-end truncate text-foreground/80 mr-1">
                  <SelectValue placeholder="All Categories" />
                </div>
              </SelectTrigger>
              <SelectContent align="start">
                <SelectItem value="__all__">All Categories</SelectItem>
                {categoriesData?.categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="w-full sm:w-[200px] flex items-stretch h-11 sm:h-auto md:h-full">
            <Select value={sortBy} onValueChange={handleSortChange}>
              <SelectTrigger className="!h-full border-none bg-muted/20 sm:bg-transparent focus:ring-0 hover:bg-muted/30 sm:hover:bg-transparent text-[12px] font-semibold px-4 w-full rounded-none flex items-center justify-between flex-1">
                <span className="text-[10px] uppercase tracking-wider font-bold text-foreground/30 shrink-0">Sort</span>
                <div className="flex-1 flex justify-end truncate text-foreground/80 mr-1">
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="views">Most Viewed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

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

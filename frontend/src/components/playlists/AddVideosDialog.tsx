import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Search, VideoIcon } from "lucide-react"
import { getVideos, getThumbnailUrl } from "@/api/videos"
import { getCategories } from "@/api/categories"
import { addVideoToPlaylist } from "@/api/playlists"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { LoadingSpinner } from "@/components/shared/LoadingSpinner"
import { EmptyState } from "@/components/shared/EmptyState"
import { toast } from "@/lib/toast"
import { formatDuration, formatFileSize } from "@/lib/formatters"
import type { Video } from "@/types/video"
import type { PlaylistWithVideos } from "@/types/playlist"

interface AddVideosDialogProps {
  isOpen: boolean
  onClose: () => void
  playlist: PlaylistWithVideos
}

export function AddVideosDialog({ isOpen, onClose, playlist }: AddVideosDialogProps) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("")
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set())
  const [skip, setSkip] = useState(0)
  const limit = 12

  // Get IDs of videos already in the playlist
  const existingVideoIds = new Set(playlist.videos.map(pv => pv.video_id))

  // Fetch all completed videos
  const { data: videosData, isLoading: isLoadingVideos } = useQuery({
    queryKey: ["videos", "add-to-playlist", { search, category_id: categoryFilter, skip }],
    queryFn: () => getVideos({
      search: search || undefined,
      category_id: categoryFilter || undefined,
      skip,
      limit
    }),
    enabled: isOpen
  })

  // Fetch categories for filter
  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
    enabled: isOpen
  })

  // Add videos mutation (use short_id for API calls)
  const addVideosMutation = useMutation({
    mutationFn: async (videoIds: string[]) => {
      // Add videos in the order they were selected
      const results = await Promise.allSettled(
        videoIds.map(videoId => addVideoToPlaylist(playlist.short_id, videoId))
      )
      
      // Check for failures
      const failures = results.filter(r => r.status === 'rejected')
      if (failures.length > 0) {
        throw new Error(`Failed to add ${failures.length} video(s)`)
      }
    },
    onSuccess: (_, videoIds) => {
      queryClient.invalidateQueries({ queryKey: ["playlist", playlist.short_id] })
      queryClient.invalidateQueries({ queryKey: ["playlists"] })
      toast.success(`Added ${videoIds.length} ${videoIds.length === 1 ? 'video' : 'videos'} to playlist`)
      handleClose()
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to add videos to playlist")
    }
  })

  const handleClose = () => {
    setSearch("")
    setCategoryFilter("")
    setSelectedVideoIds(new Set())
    setSkip(0)
    onClose()
  }

  const handleToggleVideo = (videoId: string) => {
    const newSelected = new Set(selectedVideoIds)
    if (newSelected.has(videoId)) {
      newSelected.delete(videoId)
    } else {
      newSelected.add(videoId)
    }
    setSelectedVideoIds(newSelected)
  }

  const handleAddSelected = () => {
    if (selectedVideoIds.size === 0) return
    addVideosMutation.mutate(Array.from(selectedVideoIds))
  }

  const handleLoadMore = () => {
    setSkip(skip + limit)
  }

  // Filter out videos already in playlist
  const availableVideos = videosData?.videos.filter(video => !existingVideoIds.has(video.id)) || []
  const hasMore = videosData && videosData.total > skip + videosData.videos.length

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Videos to Playlist</DialogTitle>
          <DialogDescription>
            Search and select videos to add to "{playlist.name}"
          </DialogDescription>
        </DialogHeader>

        {/* Search and Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search videos..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setSkip(0)
              }}
              className="pl-9"
            />
          </div>
          <Select 
            value={categoryFilter} 
            onValueChange={(value) => {
              setCategoryFilter(value === "__all__" ? "" : value)
              setSkip(0)
            }}
          >
            <SelectTrigger className="w-full sm:w-[200px]">
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

        {/* Video Grid */}
        <div className="min-h-[300px]">
          {isLoadingVideos ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : availableVideos.length === 0 ? (
            <EmptyState
              icon={VideoIcon}
              title="No videos available"
              description={
                existingVideoIds.size > 0 
                  ? "All available videos are already in this playlist" 
                  : "No videos found matching your search"
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {availableVideos.map((video) => (
                  <VideoSelectCard
                    key={video.id}
                    video={video}
                    isSelected={selectedVideoIds.has(video.id)}
                    onToggle={() => handleToggleVideo(video.id)}
                  />
                ))}
              </div>

              {/* Load More */}
              {hasMore && (
                <div className="flex justify-center mt-6">
                  <Button variant="outline" onClick={handleLoadMore}>
                    Load More
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex-1 text-sm text-muted-foreground">
            {selectedVideoIds.size > 0 && (
              <span>{selectedVideoIds.size} video{selectedVideoIds.size !== 1 ? 's' : ''} selected</span>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={addVideosMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAddSelected}
            disabled={selectedVideoIds.size === 0 || addVideosMutation.isPending}
          >
            {addVideosMutation.isPending 
              ? "Adding..." 
              : `Add Selected (${selectedVideoIds.size})`
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Video card with checkbox for selection
function VideoSelectCard({ 
  video, 
  isSelected, 
  onToggle 
}: { 
  video: Video
  isSelected: boolean
  onToggle: () => void
}) {
  const thumbnailUrl = video.thumbnail_filename
    ? getThumbnailUrl(video.thumbnail_filename)
    : null

  return (
    <Card 
      className={`cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-primary shadow-md' : 'hover:shadow-lg'
      }`}
      onClick={onToggle}
    >
      <div className="relative aspect-video bg-muted overflow-hidden">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <VideoIcon className="w-12 h-12 opacity-50" />
          </div>
        )}
        
        {video.duration_seconds !== null && (
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs font-medium px-2 py-1 rounded backdrop-blur-sm">
            {formatDuration(video.duration_seconds)}
          </div>
        )}

        {/* Checkbox overlay */}
        <div className="absolute top-2 left-2">
          <div 
            className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
              isSelected 
                ? 'bg-primary border-primary' 
                : 'bg-background/80 border-muted-foreground backdrop-blur-sm'
            }`}
          >
            {isSelected && (
              <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>
      </div>

      <CardContent className="p-3 space-y-1">
        <h4 className="font-semibold text-sm line-clamp-2 leading-tight">
          {video.title}
        </h4>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{video.uploader_username}</span>
          {video.category_name && (
            <>
              <span>•</span>
              <Badge variant="outline" className="text-xs px-1 py-0">
                {video.category_name}
              </Badge>
            </>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {formatFileSize(video.file_size_bytes)}
        </div>
      </CardContent>
    </Card>
  )
}

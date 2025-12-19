import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { VideoIcon, ListPlus } from "lucide-react"
import { getThumbnailUrl } from "@/api/videos"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDuration, formatUploadDate, formatFileSize, getStatusColor } from "@/lib/formatters"
import { AddToPlaylistDialog } from "@/components/playlists/AddToPlaylistDialog"
import type { Video } from "@/types/video"

interface VideoCardProps {
  video: Video
  showUploader?: boolean
}

export function VideoCard({ video, showUploader = true }: VideoCardProps) {
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
      <div className="block group relative">
        <Card className="overflow-hidden hover:shadow-lg transition-all duration-200 hover:-translate-y-1 h-full flex flex-col">
          {/* Main Link Overlay for the whole card */}
          <Link 
            to={`/videos/${video.id}`} 
            className="absolute inset-0 z-20"
            aria-label={`View video: ${video.title}`}
          />
          
          <div className="relative aspect-video bg-muted overflow-hidden z-10">
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
              <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs font-medium px-2 py-1 rounded backdrop-blur-sm z-30">
                {formatDuration(video.duration_seconds)}
              </div>
            )}
            <div className="absolute top-2 right-2 z-30">
              <Badge variant={statusColor === "green" ? "default" : "secondary"} className="capitalize backdrop-blur-sm bg-background/80">
                {video.processing_status}
              </Badge>
            </div>
            
            {/* Add to Playlist button */}
            {video.processing_status === "completed" && (
              <button
                onClick={handleAddToPlaylist}
                className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/90 backdrop-blur-sm hover:bg-background text-foreground p-2 rounded-md shadow-lg z-30"
                title="Add to playlist"
              >
                <ListPlus className="w-4 h-4" />
              </button>
            )}
          </div>
          <CardContent className="p-4 space-y-2 z-10 flex-1 flex flex-col">
            <h3 className="font-semibold line-clamp-2 leading-snug group-hover:text-primary transition-colors">
              {video.title}
            </h3>
            
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-auto relative z-30">
              {showUploader && (
                <>
                  <Link 
                    to="/profile/$username" 
                    params={{ username: video.uploader_username }}
                    className="font-medium hover:text-primary transition-colors"
                  >
                    {video.uploader_username}
                  </Link>
                  <span>•</span>
                </>
              )}
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
      </div>

      <AddToPlaylistDialog
        isOpen={isAddToPlaylistOpen}
        onClose={() => setIsAddToPlaylistOpen(false)}
        videoId={video.id}
        videoTitle={video.title}
      />
    </>
  )
}

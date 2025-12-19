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
  const [imageError, setImageError] = useState(false)
  
  const thumbnailUrl = video.thumbnail_filename
    ? getThumbnailUrl(video.thumbnail_filename)
    : null

  const statusColor = getStatusColor(video.processing_status)

  const handleAddToPlaylist = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsAddToPlaylistOpen(true)
  }

  return (
    <>
      <div className="block group relative">
        <Card className="border-none shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 h-full flex flex-col bg-card overflow-hidden">
          {/* Main Link Overlay for the whole card */}
          <Link 
            to={`/videos/${video.id}`} 
            className="absolute inset-0 z-20"
            aria-label={`View video: ${video.title}`}
          />
          
          <div className="relative aspect-video bg-muted overflow-hidden z-10">
            {video.thumbnail_filename && !imageError ? (
              <img
                src={thumbnailUrl!}
                alt=""
                onError={() => setImageError(true)}
                className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground/30 bg-gradient-to-br from-muted to-muted/50">
                <VideoIcon className="w-10 h-10" />
              </div>
            )}
            {video.duration_seconds !== null && video.processing_status === "completed" && (
              <div className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] font-medium px-1.5 py-0.5 rounded backdrop-blur-sm z-30">
                {formatDuration(video.duration_seconds)}
              </div>
            )}
            
            {video.processing_status !== "completed" && (
              <div className="absolute top-1.5 right-1.5 z-30">
                <Badge variant={statusColor === "green" ? "default" : "secondary"} className="capitalize backdrop-blur-sm bg-background/80 text-[10px] px-1.5 py-0 h-5">
                  {video.processing_status}
                </Badge>
              </div>
            )}
            
            {/* Add to Playlist button */}
            {video.processing_status === "completed" && (
              <button
                onClick={handleAddToPlaylist}
                className="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-background/90 backdrop-blur-sm hover:bg-background text-foreground p-1.5 rounded-md shadow-lg z-30"
                title="Add to playlist"
              >
                <ListPlus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <CardContent className="px-3 pt-2 pb-2.5 z-10 flex-1 flex flex-col gap-0.5">
            <h3 className="font-semibold text-[13px] line-clamp-2 leading-tight group-hover:text-primary transition-colors mb-0.5">
              {video.title}
            </h3>
            
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground relative z-30">
              {showUploader && (
                <>
                  <Link 
                    to="/profile/$username" 
                    params={{ username: video.uploader_username }}
                    className="font-medium hover:text-primary transition-colors truncate max-w-[120px]"
                  >
                    {video.uploader_username}
                  </Link>
                  <span className="opacity-50">•</span>
                </>
              )}
              <span className="shrink-0">{formatUploadDate(video.created_at)}</span>
            </div>
            
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/80 flex-wrap mt-0.5">
              {video.view_count > 0 && (
                <>
                  <span>{video.view_count.toLocaleString()} {video.view_count === 1 ? "view" : "views"}</span>
                  <span className="opacity-50">•</span>
                </>
              )}
              <span>{formatFileSize(video.file_size_bytes)}</span>
              {video.category_name && (
                <>
                  <span className="opacity-50">•</span>
                  <span className="px-1.5 py-0 rounded-sm bg-muted/50 text-muted-foreground border border-border/50">
                    {video.category_name}
                  </span>
                </>
              )}
            </div>
            {video.processing_status === "failed" && video.error_message && (
              <p className="text-[10px] text-destructive line-clamp-1 pt-1 italic">
                {video.error_message}
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

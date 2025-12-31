import { Link } from "@tanstack/react-router"
import { Play, Repeat, ChevronRight, ChevronLeft } from "lucide-react"
import { useRef, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getThumbnailUrl } from "@/api/videos"
import type { PlaylistWithVideos } from "@/types/playlist"

interface PlaylistQueueProps {
  playlist: PlaylistWithVideos
  currentVideoId: string
  onAutoPlayToggle: (enabled: boolean) => void
  autoPlayEnabled: boolean
  nextCountdown: number | null
}

export function PlaylistQueue({
  playlist,
  currentVideoId,
  onAutoPlayToggle,
  autoPlayEnabled,
  nextCountdown
}: PlaylistQueueProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const currentVideoRef = useRef<HTMLDivElement>(null)

  const currentIndex = playlist.videos.findIndex(v => v.video_id === currentVideoId)
  
  // Scroll current video into view
  useEffect(() => {
    if (currentVideoRef.current && scrollContainerRef.current) {
      currentVideoRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center"
      })
    }
  }, [currentVideoId])

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 300
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      })
    }
  }

  return (
    <Card className="bg-muted/30 border-none overflow-hidden ring-1 ring-border mt-8 rounded-none">
      <div className="p-4 border-b bg-muted/50 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-none bg-primary/10 text-primary">
            <Play className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-sm line-clamp-1">{playlist.name}</h3>
            <p className="text-xs text-muted-foreground">
              {currentIndex + 1} / {playlist.video_count} videos
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {nextCountdown !== null && (
            <Badge variant="default" className="animate-pulse py-1 rounded-none uppercase text-[10px] tracking-wider">
              Next video in {nextCountdown}s...
            </Badge>
          )}
          
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground hidden sm:inline">Autoplay</span>
            <Button
              variant={autoPlayEnabled ? "default" : "outline"}
              size="sm"
              className="h-8 w-8 p-0 rounded-none"
              onClick={() => onAutoPlayToggle(!autoPlayEnabled)}
              title={autoPlayEnabled ? "Disable Autoplay" : "Enable Autoplay"}
            >
              <Repeat className={`w-4 h-4 ${autoPlayEnabled ? "" : "opacity-50"}`} />
            </Button>
          </div>
        </div>
      </div>

      <div className="relative group">
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-0 bottom-0 z-10 w-10 bg-gradient-to-r from-background/80 to-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        <div
          ref={scrollContainerRef}
          className="flex gap-3 overflow-x-auto p-4 scroll-smooth hide-scrollbar"
        >
          {playlist.videos.map((pv, index) => {
            const isActive = pv.video_id === currentVideoId
            const thumbUrl = pv.video.thumbnail_filename ? getThumbnailUrl(pv.video.thumbnail_filename) : null

            return (
              <div
                key={pv.id}
                ref={isActive ? currentVideoRef : null}
                className="flex-shrink-0"
              >
                <Link
                  to="/v/$shortId"
                  params={{ shortId: pv.video.short_id }}
                  search={{ playlist: playlist.short_id }}
                  className={`block w-48 group/item transition-all ${isActive ? 'ring-2 ring-primary rounded-none p-1 -m-1' : 'hover:opacity-80'}`}
                >
                  <div className="relative aspect-video rounded-none overflow-hidden bg-muted mb-2 border border-border/50">
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={pv.video.title}
                        className="w-full h-full object-cover transition-transform group-hover/item:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                        <Play className="w-8 h-8" />
                      </div>
                    )}
                    {isActive && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <Play className="w-6 h-6 text-primary fill-primary" />
                      </div>
                    )}
                    <div className="absolute bottom-1 right-1 bg-black/80 text-[9px] text-white px-1 py-0.5 rounded-none font-medium">
                      {index + 1}
                    </div>
                  </div>
                  <h4 className={`text-[11px] font-semibold line-clamp-2 leading-tight ${isActive ? 'text-primary' : ''}`}>
                    {pv.video.title}
                  </h4>
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate uppercase tracking-tighter opacity-70">
                    {pv.video.uploader_username}
                  </p>
                </Link>
              </div>
            )
          })}
        </div>

        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-0 bottom-0 z-10 w-10 bg-gradient-to-l from-background/80 to-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </Card>
  )
}

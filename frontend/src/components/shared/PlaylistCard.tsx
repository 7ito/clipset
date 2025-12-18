import { Link } from "@tanstack/react-router"
import type { Playlist } from "@/types/playlist"
import { ListVideo } from "lucide-react"
import { getThumbnailUrl } from "@/api/videos"

interface PlaylistCardProps {
  playlist: Playlist
  username: string
}

// Generate a gradient based on playlist name (for consistent colors)
function generateGradient(name: string): string {
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
  
  // Use first letter to pick gradient consistently
  const index = name.charCodeAt(0) % gradients.length
  return gradients[index]
}

export function PlaylistCard({ playlist, username }: PlaylistCardProps) {
  const gradient = generateGradient(playlist.name)
  
  // Get cover image from first video thumbnail if available
  const coverImage = playlist.first_video_thumbnail 
    ? getThumbnailUrl(playlist.id) // Note: This will need the first video's ID, not playlist ID
    : null
  
  return (
    <Link
      to="/profile/$username/playlist/$id"
      params={{ username, id: playlist.id }}
      className="group block"
    >
      <div className="relative overflow-hidden rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-xl">
        {/* Cover Image or Gradient Background */}
        <div className="aspect-square relative">
          {coverImage ? (
            <img
              src={coverImage}
              alt={playlist.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${gradient}`}>
              {/* Empty playlist icon */}
              <div className="w-full h-full flex items-center justify-center">
                <ListVideo className="w-16 h-16 text-white/30" />
              </div>
            </div>
          )}
          
          {/* Overlay on hover */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200" />
          
          {/* Video count badge */}
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-black/75 text-white text-sm font-medium px-2.5 py-1 rounded-md backdrop-blur-sm">
            <ListVideo className="w-3.5 h-3.5" />
            <span>{playlist.video_count}</span>
          </div>
        </div>
        
        {/* Playlist info */}
        <div className="p-4 bg-card border-x border-b rounded-b-lg">
          <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
            {playlist.name}
          </h3>
          {playlist.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {playlist.description}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            by {playlist.creator_username}
          </p>
        </div>
      </div>
    </Link>
  )
}

// Loading skeleton for playlist cards
export function PlaylistCardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-square bg-muted rounded-t-lg" />
      <div className="p-4 bg-card border-x border-b rounded-b-lg space-y-2">
        <div className="h-5 bg-muted rounded w-3/4" />
        <div className="h-4 bg-muted rounded w-full" />
        <div className="h-3 bg-muted rounded w-1/2" />
      </div>
    </div>
  )
}

// Grid of loading skeletons
export function PlaylistGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <PlaylistCardSkeleton key={i} />
      ))}
    </div>
  )
}

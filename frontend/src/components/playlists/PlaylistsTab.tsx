import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Plus, ListVideo } from "lucide-react"
import { getPlaylistsByUser } from "@/api/playlists"
import { PlaylistCard, PlaylistGridSkeleton } from "@/components/shared/PlaylistCard"
import { EmptyState } from "@/components/shared/EmptyState"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CreatePlaylistDialog } from "./CreatePlaylistDialog"

interface PlaylistsTabProps {
  username: string
  isOwnProfile: boolean
}

type SortOption = "recent" | "alphabetical" | "most-videos"

export function PlaylistsTab({ username, isOwnProfile }: PlaylistsTabProps) {
  const [sortBy, setSortBy] = useState<SortOption>("recent")
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)

  // Fetch playlists
  const { data, isLoading, error } = useQuery({
    queryKey: ["playlists", "user", username],
    queryFn: () => getPlaylistsByUser(username)
  })

  // Sort playlists
  const sortedPlaylists = data?.playlists ? [...data.playlists].sort((a, b) => {
    switch (sortBy) {
      case "alphabetical":
        return a.name.localeCompare(b.name)
      case "most-videos":
        return b.video_count - a.video_count
      case "recent":
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    }
  }) : []

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <PlaylistGridSkeleton count={8} />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <EmptyState
        icon={ListVideo}
        title="Failed to load playlists"
        description="There was an error loading playlists. Please try again."
      />
    )
  }

  // Empty state
  if (!sortedPlaylists || sortedPlaylists.length === 0) {
    return (
      <>
        <EmptyState
          icon={ListVideo}
          title={isOwnProfile ? "No playlists yet" : `${username} hasn't created any playlists yet`}
          description={
            isOwnProfile
              ? "Create your first playlist to start organizing your favorite videos!"
              : "Check back later to see their playlists."
          }
          action={
            isOwnProfile
              ? {
                  label: "Create Playlist",
                  onClick: () => setIsCreateDialogOpen(true)
                }
              : undefined
          }
        />

        {/* Create playlist dialog */}
        {isOwnProfile && (
          <CreatePlaylistDialog
            isOpen={isCreateDialogOpen}
            onClose={() => setIsCreateDialogOpen(false)}
          />
        )}
      </>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with create button and sort */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">
            {isOwnProfile ? "My Playlists" : `${username}'s Playlists`}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {sortedPlaylists.length} {sortedPlaylists.length === 1 ? "playlist" : "playlists"}
          </p>
        </div>

        <div className="flex gap-3 w-full sm:w-auto">
          {/* Sort dropdown */}
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Most Recent</SelectItem>
              <SelectItem value="alphabetical">Alphabetical</SelectItem>
              <SelectItem value="most-videos">Most Videos</SelectItem>
            </SelectContent>
          </Select>

          {/* Create button (only for own profile) */}
          {isOwnProfile && (
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Playlist
            </Button>
          )}
        </div>
      </div>

      {/* Playlists grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {sortedPlaylists.map((playlist) => (
          <PlaylistCard key={playlist.id} playlist={playlist} username={username} />
        ))}
      </div>

      {/* Create playlist dialog */}
      {isOwnProfile && (
        <CreatePlaylistDialog
          isOpen={isCreateDialogOpen}
          onClose={() => setIsCreateDialogOpen(false)}
        />
      )}
    </div>
  )
}

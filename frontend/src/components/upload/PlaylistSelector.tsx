import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ListPlus, Plus, ChevronDown } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import { getPlaylistsByUser } from "@/api/playlists"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export type PlaylistOption = "none" | "existing" | "new"

interface PlaylistSelectorProps {
  option: PlaylistOption
  onOptionChange: (option: PlaylistOption) => void
  selectedPlaylistId: string
  onSelectedPlaylistChange: (id: string) => void
  newPlaylistName: string
  onNewPlaylistNameChange: (name: string) => void
  newPlaylistDescription: string
  onNewPlaylistDescriptionChange: (description: string) => void
  disabled?: boolean
}

export function PlaylistSelector({
  option,
  onOptionChange,
  selectedPlaylistId,
  onSelectedPlaylistChange,
  newPlaylistName,
  onNewPlaylistNameChange,
  newPlaylistDescription,
  onNewPlaylistDescriptionChange,
  disabled = false
}: PlaylistSelectorProps) {
  const { user } = useAuth()
  const [isExpanded, setIsExpanded] = useState(option !== "none")

  // Fetch user's playlists
  const { data: playlistsData, isLoading } = useQuery({
    queryKey: ["playlists", "by-user", user?.username],
    queryFn: () => getPlaylistsByUser(user!.username),
    enabled: !!user
  })

  const playlists = playlistsData?.playlists || []

  const handleOptionChange = (value: PlaylistOption) => {
    onOptionChange(value)
    if (value !== "none") {
      setIsExpanded(true)
    }
  }

  return (
    <div className="space-y-4">
      {/* Collapsible Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full text-left"
        disabled={disabled}
      >
        <div className="flex items-center gap-2">
          <ListPlus className="w-5 h-5 text-muted-foreground" />
          <span className="font-medium">Add to Playlist</span>
          {option !== "none" && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {option === "existing" ? "Adding to playlist" : "Creating new playlist"}
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            "w-5 h-5 text-muted-foreground transition-transform",
            isExpanded && "rotate-180"
          )}
        />
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="pl-7 space-y-4">
          <RadioGroup
            value={option}
            onValueChange={(value) => handleOptionChange(value as PlaylistOption)}
            disabled={disabled}
          >
            {/* No Playlist */}
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="none" id="playlist-none" />
              <Label
                htmlFor="playlist-none"
                className="text-sm font-normal cursor-pointer"
              >
                Don't add to playlist
              </Label>
            </div>

            {/* Existing Playlist */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="existing" id="playlist-existing" />
                <Label
                  htmlFor="playlist-existing"
                  className="text-sm font-normal cursor-pointer"
                >
                  Add to existing playlist
                </Label>
              </div>

              {option === "existing" && (
                <div className="ml-6">
                  {isLoading ? (
                    <div className="h-10 bg-muted animate-pulse rounded-md" />
                  ) : playlists.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No playlists found. Create one below!
                    </p>
                  ) : (
                    <Select
                      value={selectedPlaylistId}
                      onValueChange={onSelectedPlaylistChange}
                      disabled={disabled}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a playlist" />
                      </SelectTrigger>
                      <SelectContent>
                        {playlists.map((playlist) => (
                          <SelectItem key={playlist.short_id} value={playlist.short_id}>
                            <div className="flex items-center gap-2">
                              <span>{playlist.name}</span>
                              <span className="text-xs text-muted-foreground">
                                ({playlist.video_count} videos)
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>

            {/* New Playlist */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="new" id="playlist-new" />
                <Label
                  htmlFor="playlist-new"
                  className="text-sm font-normal cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Create new playlist
                </Label>
              </div>

              {option === "new" && (
                <div className="ml-6 space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="new-playlist-name" className="text-xs">
                      Playlist Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="new-playlist-name"
                      value={newPlaylistName}
                      onChange={(e) => onNewPlaylistNameChange(e.target.value)}
                      placeholder="e.g., Saturday Hoops"
                      maxLength={200}
                      disabled={disabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new-playlist-desc" className="text-xs">
                      Description (optional)
                    </Label>
                    <Textarea
                      id="new-playlist-desc"
                      value={newPlaylistDescription}
                      onChange={(e) => onNewPlaylistDescriptionChange(e.target.value)}
                      placeholder="Add a description for this playlist..."
                      rows={2}
                      maxLength={1000}
                      disabled={disabled}
                      className="resize-none"
                    />
                  </div>
                </div>
              )}
            </div>
          </RadioGroup>
        </div>
      )}
    </div>
  )
}

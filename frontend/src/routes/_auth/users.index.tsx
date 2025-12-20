import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { useUserDirectory } from "@/api/users"
import { UserCard } from "@/components/shared/UserCard"
import { PageHeader } from "@/components/shared/PageHeader"
import { EmptyState } from "@/components/shared/EmptyState"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Users as UsersIcon } from "lucide-react"

export const Route = createFileRoute("/_auth/users/")({
  component: UsersDirectoryPage
})

type SortOption = "newest" | "alphabetical" | "videos" | "playlists"

function UsersDirectoryPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<SortOption>("newest")

  const { data: users, isLoading, error } = useUserDirectory({
    search: searchQuery || undefined,
    sort: sortBy
  })

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-destructive">Error loading users</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Users" 
        description={`Discover and connect with ${users?.length || 0} community members`}
      />

      {/* Unified Filter Bar */}
      <div className="flex flex-col md:flex-row md:h-11 items-stretch gap-0 border border-border bg-card/50 backdrop-blur-sm shadow-sm group/filterbar focus-within:border-primary/50 transition-all duration-300">
        <div className="flex-1 flex items-stretch relative border-b md:border-b-0 md:border-r border-border focus-within:bg-card transition-colors min-w-0 h-11 md:h-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40 group-focus-within/filterbar:text-primary transition-colors pointer-events-none z-10" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 !h-full border-none bg-transparent focus-visible:ring-0 placeholder:text-foreground/40 text-[13px] font-medium w-full"
          />
        </div>
        
        <div className="w-full md:w-[220px] flex items-stretch h-11 md:h-full">
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
            <SelectTrigger className="!h-full border-none bg-muted/20 md:bg-transparent focus:ring-0 hover:bg-muted/30 md:hover:bg-transparent text-[12px] font-semibold px-4 w-full rounded-none flex items-center justify-between flex-1">
              <span className="text-[10px] uppercase tracking-wider font-bold text-foreground/30 shrink-0">Sort</span>
              <div className="flex-1 flex justify-end truncate text-foreground/80 mr-1">
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="newest">Newest Members</SelectItem>
              <SelectItem value="alphabetical">A - Z</SelectItem>
              <SelectItem value="videos">Most Videos</SelectItem>
              <SelectItem value="playlists">Most Playlists</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="animate-pulse bg-card border border-border rounded-2xl p-6 flex flex-col items-center">
              <div className="w-24 h-24 bg-muted rounded-full mb-4" />
              <div className="h-6 bg-muted rounded w-3/4 mb-4" />
              <div className="flex gap-4">
                <div className="w-16 h-8 bg-muted rounded-full" />
                <div className="w-16 h-8 bg-muted rounded-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Users Grid */}
      {!isLoading && users && users.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
          {users.map((user) => (
            <UserCard key={user.id} user={user} />
          ))}
        </div>
      )}

      {/* Empty States */}
      {!isLoading && users && users.length === 0 && (
        <EmptyState
          icon={searchQuery ? Search : UsersIcon}
          title={searchQuery ? "No users found" : "No users yet"}
          description={searchQuery ? `No members match "${searchQuery}"` : "The community is just getting started!"}
        />
      )}
    </div>
  )
}

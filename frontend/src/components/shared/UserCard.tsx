import { Link } from "@tanstack/react-router"
import { UserAvatar } from "./UserAvatar"
import { Video, ListMusic } from "lucide-react"
import type { UserDirectoryResponse } from "@/types/user"

interface UserCardProps {
  user: UserDirectoryResponse
}

export function UserCard({ user }: UserCardProps) {
  return (
    <Link
      to="/profile/$username"
      params={{ username: user.username }}
      className="group"
    >
      <div className="relative flex flex-col items-center p-6 bg-card border border-border rounded-none transition-all duration-300 hover:shadow-2xl hover:shadow-primary/20 hover:-translate-y-1 hover:border-primary/50 group-hover:bg-accent/5 overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute -top-12 -right-12 w-24 h-24 dark:bg-primary/10 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/20 transition-all duration-500" />
        
        <UserAvatar 
          username={user.username} 
          avatarUrl={user.avatar_url}
          size="xl" 
          className="mb-4 group-hover:scale-110 group-hover:rotate-3" 
        />
        
        <h3 className="text-xl font-bold tracking-tight mb-3 group-hover:text-primary transition-colors truncate w-full text-center">
          {user.username}
        </h3>
        
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
            <Video className="w-3.5 h-3.5" />
            <span>{user.video_count}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-500 text-xs font-semibold">
            <ListMusic className="w-3.5 h-3.5" />
            <span>{user.playlist_count}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

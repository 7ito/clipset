import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/shared/UserAvatar"
import { formatDate } from "@/lib/formatters"
import { UserX, UserCheck, Shield, User as UserIcon, Video, ListMusic } from "lucide-react"
import type { UserResponse } from "@/types/user"

interface UsersTableProps {
  users: UserResponse[]
  isLoading: boolean
  onToggleStatus: (userId: string, currentStatus: boolean) => void
}

export function UsersTable({ users, isLoading, onToggleStatus }: UsersTableProps) {
  if (isLoading) {
    return (
      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Stats</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i}>
                {[...Array(7)].map((_, j) => (
                  <TableCell key={j}>
                    <div className="h-6 w-full animate-pulse rounded bg-muted" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Stats</TableHead>
            <TableHead>Joined</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <UserAvatar username={user.username} avatarUrl={user.avatar_url} size="sm" />
                  <span className="font-medium">{user.username}</span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{user.email}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  {user.role === "admin" ? (
                    <Badge variant="default" className="bg-primary/20 text-primary border-primary/20 hover:bg-primary/20">
                      <Shield className="w-3 h-3 mr-1" />
                      Admin
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      <UserIcon className="w-3 h-3 mr-1" />
                      User
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Video className="w-3 h-3" />
                    {user.video_count}
                  </span>
                  <span className="flex items-center gap-1">
                    <ListMusic className="w-3 h-3" />
                    {user.playlist_count}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDate(user.created_at)}</TableCell>
              <TableCell>
                <Badge variant={user.is_active ? "outline" : "destructive"}>
                  {user.is_active ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onToggleStatus(user.id, user.is_active)}
                  className={user.is_active ? "text-destructive hover:text-destructive hover:bg-destructive/10" : "text-emerald-500 hover:text-emerald-500 hover:bg-emerald-500/10"}
                >
                  {user.is_active ? (
                    <>
                      <UserX className="mr-2 h-4 w-4" />
                      Deactivate
                    </>
                  ) : (
                    <>
                      <UserCheck className="mr-2 h-4 w-4" />
                      Activate
                    </>
                  )}
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {users.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="h-24 text-center">
                No users found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

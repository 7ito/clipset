import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { User as UserIcon, Calendar, Mail, Shield, HardDrive } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import { getUserByUsername } from "@/api/users"
import { getVideos } from "@/api/videos"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { LoadingSpinner } from "@/components/shared/LoadingSpinner"
import { formatDate, formatFileSize } from "@/lib/formatters"
import type { UserWithQuota } from "@/types/user"

export const Route = createFileRoute("/_auth/profile/$username")({
  component: ProfileLayout
})

function UserAvatar({ username }: { username: string }) {
  // Generate initials from username
  // e.g., "john_doe" → "JD", "alice" → "A"
  const parts = username.split(/[_-]/)
  const initials = parts
    .map(part => part[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join("")

  return (
    <div className="w-24 h-24 rounded-full bg-primary flex items-center justify-center">
      <span className="text-3xl font-bold text-primary-foreground">
        {initials || username[0]?.toUpperCase() || "?"}
      </span>
    </div>
  )
}

function MyProfileDialog({ isOpen, onClose, user }: { isOpen: boolean; onClose: () => void; user: UserWithQuota }) {
  const quotaPercentage = user.weekly_upload_bytes / (4 * 1024 * 1024 * 1024) * 100

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>My Profile</DialogTitle>
        </DialogHeader>

        <div className="grid gap-8 lg:grid-cols-2 mt-6">
          {/* Upload Quota Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="w-5 h-5" />
                Upload Quota
              </CardTitle>
              <CardDescription>Your weekly upload limits and usage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Weekly Upload Usage</p>
                <p className="text-3xl font-bold">{formatFileSize(user.weekly_upload_bytes)}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  of 4 GB weekly limit
                </p>
                <Progress value={quotaPercentage} className="mt-3" />
              </div>

              <Separator />

              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Last Reset</p>
                <p className="text-lg font-semibold">{formatDate(user.last_upload_reset)}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Resets every Sunday at midnight UTC
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Account Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserIcon className="w-5 h-5" />
                Account Information
              </CardTitle>
              <CardDescription>Your personal details and account status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-6">
                <div className="flex items-start gap-3">
                  <UserIcon className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">Username</p>
                    <p className="text-lg font-semibold truncate">{user.username}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">Email</p>
                    <p className="text-lg font-semibold truncate">{user.email}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground mb-2">Role</p>
                    <Badge variant={user.role === "admin" ? "default" : "secondary"} className="capitalize">
                      {user.role}
                    </Badge>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">Member Since</p>
                    <p className="text-lg font-semibold">{formatDate(user.created_at)}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground mb-2">Account Status</p>
                    <Badge variant={user.is_active ? "default" : "destructive"} className="text-sm px-3 py-1">
                      {user.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ProfileLayout() {
  const { username } = Route.useParams()
  const { user: currentUser } = useAuth()
  const location = useLocation()
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  // Check if we're on a playlist route
  const isPlaylistRoute = location.pathname.includes('/playlist/')

  // Fetch profile user by username
  const { data: profileUser, isLoading: isLoadingUser, error: userError } = useQuery({
    queryKey: ["user", "by-username", username],
    queryFn: () => getUserByUsername(username)
  })

  // Fetch video count for header display
  const { data: videosData } = useQuery({
    queryKey: ["videos", "user", profileUser?.id, "count"],
    queryFn: () => getVideos({
      uploaded_by: profileUser?.id,
      skip: 0,
      limit: 1  // Just need the total count
    }),
    enabled: !!profileUser
  })

  const isOwnProfile = profileUser?.id === currentUser?.id

  // Loading state
  if (isLoadingUser) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    )
  }

  // Error state
  if (userError || !profileUser) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="p-8 text-center max-w-md">
          <CardContent className="space-y-4 pt-6">
            <UserIcon className="w-16 h-16 mx-auto text-muted-foreground opacity-50" />
            <div>
              <h2 className="text-2xl font-bold mb-2">Profile Not Found</h2>
              <p className="text-muted-foreground">
                The user "{username}" doesn't exist or has been deactivated.
              </p>
            </div>
            <Link to="/dashboard">
              <Button variant="outline">Go to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // If on playlist route, render child without header
  if (isPlaylistRoute) {
    return <Outlet context={{ profileUser, isOwnProfile }} />
  }

  // Otherwise render with profile header (for index page)
  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Profile Header */}
      <div className="flex flex-col items-center text-center space-y-6">
        <UserAvatar username={profileUser.username} />

        <div className="space-y-2">
          <h1 className="text-3xl font-bold">{profileUser.username}</h1>
          <p className="text-muted-foreground">
            {videosData?.total || 0} {videosData?.total === 1 ? "video" : "videos"}
          </p>
        </div>

        {isOwnProfile && "email" in profileUser && (
          <Button onClick={() => setIsDialogOpen(true)}>
            My Profile
          </Button>
        )}
      </div>

      <Separator />

      {/* Child route (index page with tabs) renders here */}
      <Outlet context={{ profileUser, isOwnProfile }} />

      {/* My Profile Dialog */}
      {isOwnProfile && "email" in profileUser && (
        <MyProfileDialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          user={profileUser as UserWithQuota}
        />
      )}
    </div>
  )
}

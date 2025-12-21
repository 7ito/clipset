import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useState, createContext, useContext, useRef } from "react"
import { User as UserIcon, Calendar, Mail, Shield, HardDrive, Camera, Trash2, Loader2 } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import { getUserByUsername, useUploadAvatar, useDeleteAvatar } from "@/api/users"
import { getVideos } from "@/api/videos"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { LoadingSpinner } from "@/components/shared/LoadingSpinner"
import { UserAvatar } from "@/components/shared/UserAvatar"
import { formatDate, formatFileSize } from "@/lib/formatters"
import { toast } from "@/lib/toast"
import type { UserProfile, UserWithQuota } from "@/types/user"

export const Route = createFileRoute("/_auth/profile/$username")({
  component: ProfileLayout
})

interface ProfileContextType {
  profileUser: UserProfile | UserWithQuota
  isOwnProfile: boolean
}

const ProfileContext = createContext<ProfileContextType | null>(null)

export function useProfileContext() {
  const context = useContext(ProfileContext)
  if (!context) {
    throw new Error("useProfileContext must be used within a ProfileLayout")
  }
  return context
}

function MyProfileDialog({ isOpen, onClose, user }: { isOpen: boolean; onClose: () => void; user: UserWithQuota }) {
  const quotaPercentage = user.weekly_upload_bytes / (4 * 1024 * 1024 * 1024) * 100
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadAvatar = useUploadAvatar()
  const deleteAvatar = useDeleteAvatar()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error("Image must be smaller than 2MB")
        return
      }
      uploadAvatar.mutate(file, {
        onSuccess: () => {
          toast.success("Avatar updated successfully")
        },
        onError: (error: any) => {
          toast.error(error.response?.data?.detail || "Failed to upload avatar")
        }
      })
    }
  }

  const handleDeleteAvatar = () => {
    if (confirm("Are you sure you want to remove your avatar?")) {
      deleteAvatar.mutate(undefined, {
        onSuccess: () => {
          toast.success("Avatar removed")
        },
        onError: (error: any) => {
          toast.error(error.response?.data?.detail || "Failed to remove avatar")
        }
      })
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>My Profile</DialogTitle>
        </DialogHeader>

        <div className="grid gap-8 lg:grid-cols-2 mt-6">
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
              {/* Avatar Upload Section */}
              <div className="flex flex-col items-center gap-4 py-4 bg-muted/30 rounded-xl border border-dashed border-border">
                <div className="relative group">
                  <UserAvatar 
                    username={user.username} 
                    avatarUrl={user.avatar_url} 
                    size="xl" 
                    className="ring-4 ring-background shadow-xl"
                  />
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadAvatar.isPending}
                    className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:cursor-not-allowed"
                    title="Change Avatar"
                  >
                    {uploadAvatar.isPending ? (
                      <Loader2 className="w-8 h-8 text-white animate-spin" />
                    ) : (
                      <Camera className="w-8 h-8 text-white" />
                    )}
                  </button>
                </div>
                
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/*" 
                  className="hidden" 
                />

                <div className="flex gap-2">
                  {user.avatar_url && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={handleDeleteAvatar}
                      disabled={deleteAvatar.isPending}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Remove
                    </Button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                  JPG, PNG, WebP • Max 2MB
                </p>
              </div>

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
              </div>
            </CardContent>
          </Card>

          {/* Upload Quota Card */}
          <Card className="h-fit">
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
    return (
      <ProfileContext.Provider value={{ profileUser, isOwnProfile }}>
        <Outlet context={{ profileUser, isOwnProfile }} />
      </ProfileContext.Provider>
    )
  }

  // Otherwise render with profile header (for index page)
  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Profile Header */}
      <div className="flex flex-col items-center text-center space-y-6">
        <UserAvatar username={profileUser.username} avatarUrl={profileUser.avatar_url} size="xl" />

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
      <ProfileContext.Provider value={{ profileUser, isOwnProfile }}>
        <Outlet context={{ profileUser, isOwnProfile }} />
      </ProfileContext.Provider>

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

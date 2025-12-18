import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Users, Video, HardDrive, Activity, Clock, CheckCircle, XCircle, Loader2, RotateCcw } from "lucide-react"
import { getAdminStats } from "@/api/users"
import { getVideos, resetAllQuotas } from "@/api/videos"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { PageHeader } from "@/components/shared/PageHeader"
import { LoadingSpinner } from "@/components/shared/LoadingSpinner"
import { formatFileSize, formatUploadDate } from "@/lib/formatters"
import { toast } from "@/lib/toast"

export const Route = createFileRoute("/_auth/admin/")({
  component: AdminDashboard
})

function AdminDashboard() {
  const queryClient = useQueryClient()

  // Fetch admin stats
  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: getAdminStats
  })

  // Fetch recent videos for activity feed
  const { data: recentVideos, isLoading: isLoadingVideos } = useQuery({
    queryKey: ["admin", "recent-videos"],
    queryFn: () => getVideos({ limit: 10, skip: 0 })
  })

  // Mutation for resetting quotas
  const resetQuotasMutation = useMutation({
    mutationFn: resetAllQuotas,
    onSuccess: (data) => {
      toast.success(data.message)
      // Refetch admin stats to show updated quotas
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Failed to reset quotas")
    }
  })

  if (isLoadingStats) {
    return <LoadingSpinner size="lg" text="Loading admin dashboard..." />
  }

  if (!stats) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Failed to load admin statistics</p>
      </div>
    )
  }

  const completionRate = stats.totalVideos > 0
    ? Math.round((stats.videosByStatus.completed / stats.totalVideos) * 100)
    : 0

  return (
    <div className="space-y-8">
      <PageHeader
        title="Admin Dashboard"
        description="System overview and statistics"
      />

      {/* Stats Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Users */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Registered accounts
            </p>
          </CardContent>
        </Card>

        {/* Total Videos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Videos</CardTitle>
            <Video className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalVideos}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {completionRate}% completed
            </p>
          </CardContent>
        </Card>

        {/* Storage Used */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
            <HardDrive className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatFileSize(stats.totalStorageBytes)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Total disk space
            </p>
          </CardContent>
        </Card>

        {/* Processing Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Processing</CardTitle>
            <Activity className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stats.videosByStatus.processing + stats.videosByStatus.pending}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Videos in queue
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Video Status Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Video Processing Status</CardTitle>
          <CardDescription>Breakdown by processing stage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.videosByStatus.completed}</p>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Loader2 className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.videosByStatus.processing}</p>
                <p className="text-sm text-muted-foreground">Processing</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Clock className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.videosByStatus.pending}</p>
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <XCircle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.videosByStatus.failed}</p>
                <p className="text-sm text-muted-foreground">Failed</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Admin Actions Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5" />
            Admin Actions
          </CardTitle>
          <CardDescription>
            System maintenance and administrative tasks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Reset Upload Quotas</h3>
                <p className="text-sm text-muted-foreground">
                  Reset weekly upload quotas to 0 for all users. This should typically be done at the start of each week.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="shrink-0">
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Reset All Quotas
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset All Upload Quotas?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will reset weekly upload quotas to 0 bytes for all users. 
                      Users will be able to upload up to their weekly limit again. 
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => resetQuotasMutation.mutate()}
                      disabled={resetQuotasMutation.isPending}
                    >
                      {resetQuotasMutation.isPending ? "Resetting..." : "Reset All Quotas"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Uploads</CardTitle>
          <CardDescription>Latest videos uploaded to the system</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingVideos ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : recentVideos && recentVideos.videos.length > 0 ? (
            <div className="space-y-4">
              {recentVideos.videos.slice(0, 10).map((video) => (
                <div
                  key={video.id}
                  className="flex items-center justify-between gap-4 p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <Link
                      to="/videos/$id"
                      params={{ id: video.id }}
                      className="font-medium hover:text-primary transition-colors line-clamp-1"
                    >
                      {video.title}
                    </Link>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                      <Link
                        to="/profile/$username"
                        params={{ username: video.uploader_username }}
                        className="hover:text-primary transition-colors"
                      >
                        {video.uploader_username}
                      </Link>
                      <span>•</span>
                      <span>{formatUploadDate(video.created_at)}</span>
                      <span>•</span>
                      <span>{formatFileSize(video.file_size_bytes)}</span>
                    </div>
                  </div>
                  <Badge
                    variant={
                      video.processing_status === "completed"
                        ? "default"
                        : video.processing_status === "failed"
                        ? "destructive"
                        : "secondary"
                    }
                    className="capitalize shrink-0"
                  >
                    {video.processing_status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">No videos uploaded yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

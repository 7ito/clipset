import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Upload, VideoIcon, Eye, HardDrive } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import { getVideos, getQuotaInfo } from "@/api/videos"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatFileSize } from "@/lib/formatters"
import { PageHeader } from "@/components/shared/PageHeader"
import { EmptyState } from "@/components/shared/EmptyState"

export const Route = createFileRoute("/_auth/dashboard")({
  component: DashboardPage
})

function DashboardPage() {
  const { user } = useAuth()

  // Fetch user's videos
  const { data: videosData } = useQuery({
    queryKey: ["videos", "me"],
    queryFn: () => getVideos({ uploaded_by: user?.id })
  })

  // Fetch quota
  const { data: quota } = useQuery({
    queryKey: ["quota", "me"],
    queryFn: getQuotaInfo
  })

  // Calculate total views
  const totalViews = videosData?.videos.reduce((sum, video) => sum + video.view_count, 0) || 0

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome back, ${user?.username}!`}
        description="Your personal video sharing dashboard"
      />

      {/* Quick Stats */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Videos Uploaded</CardTitle>
            <VideoIcon className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{videosData?.total || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Total uploads
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Views</CardTitle>
            <Eye className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalViews}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Across all videos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Storage Used</CardTitle>
            <HardDrive className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {quota ? formatFileSize(quota.used_bytes) : "0 MB"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              of {quota ? formatFileSize(quota.limit_bytes) : "4 GB"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Upload Quota</CardTitle>
            <Upload className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {quota ? `${quota.percentage_used.toFixed(0)}%` : "0%"}
            </div>
            <Progress value={quota?.percentage_used || 0} className="mt-3" />
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Get started with your videos</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3">
          <Link to="/upload" className="flex-1 sm:flex-initial">
            <Button className="w-full sm:w-auto">
              <Upload className="w-4 h-4 mr-2" />
              Upload Video
            </Button>
          </Link>
          <Link to="/videos" className="flex-1 sm:flex-initial">
            <Button variant="outline" className="w-full sm:w-auto">
              <VideoIcon className="w-4 h-4 mr-2" />
              Browse Videos
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Recent Uploads */}
      {videosData && videosData.videos.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Uploads</CardTitle>
                <CardDescription>Your latest videos</CardDescription>
              </div>
              <Link to="/videos" search={{ uploaded_by: user?.id }}>
                <Button variant="ghost" size="sm">View All</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {videosData.videos.slice(0, 5).map((video) => (
                <Link key={video.id} to={`/videos/${video.id}`}>
                  <div className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors group">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate group-hover:text-primary transition-colors">
                        {video.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge 
                          variant={video.processing_status === "completed" ? "default" : "secondary"} 
                          className="text-xs capitalize"
                        >
                          {video.processing_status}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {video.view_count} {video.view_count === 1 ? "view" : "views"}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : videosData ? (
        <EmptyState
          icon={VideoIcon}
          title="No videos yet"
          description="You haven't uploaded any videos. Get started by uploading your first video!"
          action={{
            label: "Upload Video",
            onClick: () => window.location.href = "/upload"
          }}
        />
      ) : null}
    </div>
  )
}

import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { User as UserIcon, VideoIcon, Calendar, Mail, Shield, HardDrive } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import { getUserByUsername } from "@/api/users"
import { getVideos, getThumbnailUrl } from "@/api/videos"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState } from "@/components/shared/EmptyState"
import { VideoGridSkeleton } from "@/components/shared/VideoCardSkeleton"
import { LoadingSpinner } from "@/components/shared/LoadingSpinner"
import { PlaylistsTab } from "@/components/playlists/PlaylistsTab"
import { formatDate, formatFileSize, formatDuration, formatUploadDate, getStatusColor } from "@/lib/formatters"
import type { Video } from "@/types/video"
import type { UserWithQuota } from "@/types/user"

export const Route = createFileRoute("/_auth/profile/$username")({
	component: ProfilePage
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

function VideoCard({ video }: { video: Video }) {
	const thumbnailUrl = video.thumbnail_filename
		? getThumbnailUrl(video.id)
		: "/placeholder-video.jpg"

	const statusColor = getStatusColor(video.processing_status)

	return (
		<Link to={`/videos/${video.id}`} className="block group">
			<Card className="overflow-hidden hover:shadow-lg transition-all duration-200 hover:-translate-y-1">
				<div className="relative aspect-video bg-muted overflow-hidden">
					{video.thumbnail_filename ? (
						<img
							src={thumbnailUrl}
							alt={video.title}
							className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
						/>
					) : (
						<div className="w-full h-full flex items-center justify-center text-muted-foreground bg-gradient-to-br from-muted to-muted/50">
							<VideoIcon className="w-16 h-16 opacity-50" />
						</div>
					)}
					{video.duration_seconds !== null && video.processing_status === "completed" && (
						<div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs font-medium px-2 py-1 rounded backdrop-blur-sm">
							{formatDuration(video.duration_seconds)}
						</div>
					)}
					<div className="absolute top-2 right-2">
						<Badge variant={statusColor === "green" ? "default" : "secondary"} className="capitalize backdrop-blur-sm bg-background/80">
							{video.processing_status}
						</Badge>
					</div>
				</div>
				<CardContent className="p-4 space-y-2">
					<h3 className="font-semibold line-clamp-2 leading-snug group-hover:text-primary transition-colors">
						{video.title}
					</h3>
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<span>{formatUploadDate(video.created_at)}</span>
					</div>
					<div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
						{video.view_count > 0 && (
							<>
								<span>{video.view_count} {video.view_count === 1 ? "view" : "views"}</span>
								<span>•</span>
							</>
						)}
						<span>{formatFileSize(video.file_size_bytes)}</span>
						{video.category_name && (
							<>
								<span>•</span>
								<Badge variant="outline" className="text-xs">
									{video.category_name}
								</Badge>
							</>
						)}
					</div>
					{video.processing_status === "failed" && video.error_message && (
						<p className="text-xs text-destructive line-clamp-1 pt-1">
							Error: {video.error_message}
						</p>
					)}
				</CardContent>
			</Card>
		</Link>
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

function ProfilePage() {
	const { username } = Route.useParams()
	const { user: currentUser } = useAuth()
	const [isDialogOpen, setIsDialogOpen] = useState(false)
	const [skip, setSkip] = useState(0)
	const limit = 20

	// Fetch profile user by username
	const { data: profileUser, isLoading: isLoadingUser, error: userError } = useQuery({
		queryKey: ["user", "by-username", username],
		queryFn: () => getUserByUsername(username)
	})

	// Fetch user's videos
	const { data: videosData, isLoading: isLoadingVideos } = useQuery({
		queryKey: ["videos", "user", profileUser?.id, skip],
		queryFn: () => getVideos({
			uploaded_by: profileUser?.id,
			skip,
			limit
		}),
		enabled: !!profileUser
	})

	const isOwnProfile = profileUser?.id === currentUser?.id
	const hasMoreVideos = videosData && videosData.total > skip + videosData.videos.length

	if (isLoadingUser) {
		return (
			<div className="flex items-center justify-center min-h-[400px]">
				<LoadingSpinner />
			</div>
		)
	}

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

		{/* Tabs: Videos | Playlists */}
		<Tabs defaultValue="videos" className="space-y-6">
			<TabsList className="grid w-full grid-cols-2 max-w-md mx-auto">
				<TabsTrigger value="videos">Videos</TabsTrigger>
				<TabsTrigger value="playlists">Playlists</TabsTrigger>
			</TabsList>

			{/* Videos Tab */}
			<TabsContent value="videos" className="space-y-6">
				<h2 className="text-2xl font-semibold">Videos</h2>

				{isLoadingVideos ? (
					<VideoGridSkeleton count={8} />
				) : videosData?.videos.length === 0 ? (
					<EmptyState
						icon={VideoIcon}
						title={isOwnProfile ? "No videos yet" : `${profileUser.username} hasn't uploaded any videos yet`}
						description={
							isOwnProfile
								? "You haven't uploaded any videos. Get started by uploading your first video!"
								: "Check back later to see their content."
						}
						action={
							isOwnProfile
								? {
									label: "Upload Video",
									onClick: () => window.location.href = "/upload"
								}
								: undefined
						}
					/>
				) : (
					<>
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
							{videosData?.videos.map((video) => (
								<VideoCard key={video.id} video={video} />
							))}
						</div>

						{/* Load More */}
						{hasMoreVideos && (
							<div className="flex justify-center pt-4">
								<Button onClick={() => setSkip(skip + limit)} variant="outline" size="lg">
									Load More Videos
								</Button>
							</div>
						)}
					</>
				)}
			</TabsContent>

			{/* Playlists Tab */}
			<TabsContent value="playlists">
				<PlaylistsTab username={profileUser.username} isOwnProfile={isOwnProfile} />
			</TabsContent>
		</Tabs>

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

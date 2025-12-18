import { createFileRoute } from "@tanstack/react-router"
import { useAuth } from "@/hooks/useAuth"
import { formatDate, formatBytes } from "@/lib/formatters"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { PageHeader } from "@/components/shared/PageHeader"
import { User as UserIcon, Mail, Shield, Calendar, HardDrive } from "lucide-react"

export const Route = createFileRoute("/_auth/profile")({
  component: ProfilePage
})

function ProfilePage() {
  const { user } = useAuth()

  if (!user) return null

  return (
    <div className="space-y-8 max-w-4xl">
      <PageHeader
        title="Profile"
        description="View and manage your account information"
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="w-5 h-5" />
              Account Information
            </CardTitle>
            <CardDescription>Your personal details and account status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
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
              <p className="text-3xl font-bold">{formatBytes(user.weekly_upload_bytes)}</p>
              <p className="text-sm text-muted-foreground mt-1">
                of 4 GB weekly limit
              </p>
            </div>

            <Separator />

            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Last Reset</p>
              <p className="text-lg font-semibold">{formatDate(user.last_upload_reset)}</p>
              <p className="text-sm text-muted-foreground mt-1">
                Resets every Sunday at midnight UTC
              </p>
            </div>

            <Separator />

            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Account Status</p>
              <Badge variant={user.is_active ? "default" : "destructive"} className="text-sm px-3 py-1">
                {user.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

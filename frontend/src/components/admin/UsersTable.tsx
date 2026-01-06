import { useState } from "react"
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
import {
  UserX,
  UserCheck,
  Shield,
  User as UserIcon,
  Video,
  ListMusic,
  MoreHorizontal,
  KeyRound,
  Copy,
  Check,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useGeneratePasswordResetLink } from "@/api/users"
import { toast } from "@/lib/toast"
import { getErrorMessage } from "@/lib/api-client"
import type { UserResponse } from "@/types/user"

interface UsersTableProps {
  users: UserResponse[]
  isLoading: boolean
  onToggleStatus: (userId: string, currentStatus: boolean) => void
}

export function UsersTable({ users, isLoading, onToggleStatus }: UsersTableProps) {
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    type: "activate" | "deactivate" | "reset-link"
    user: UserResponse | null
  }>({ open: false, type: "activate", user: null })

  const [resetLinkDialog, setResetLinkDialog] = useState<{
    open: boolean
    link: string
    expiresAt: string
    username: string
  }>({ open: false, link: "", expiresAt: "", username: "" })

  const [copied, setCopied] = useState(false)

  const generateResetLink = useGeneratePasswordResetLink()

  const handleConfirmAction = () => {
    if (!confirmDialog.user) return

    if (confirmDialog.type === "reset-link") {
      generateResetLink.mutate(confirmDialog.user.id, {
        onSuccess: (data) => {
          setConfirmDialog({ open: false, type: "activate", user: null })
          setResetLinkDialog({
            open: true,
            link: data.reset_link,
            expiresAt: data.expires_at,
            username: confirmDialog.user?.username || "",
          })
        },
        onError: (error) => {
          toast.error(getErrorMessage(error))
        },
      })
    } else {
      onToggleStatus(confirmDialog.user.id, confirmDialog.user.is_active)
      setConfirmDialog({ open: false, type: "activate", user: null })
    }
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(resetLinkDialog.link)
      setCopied(true)
      toast.success("Reset link copied to clipboard")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Failed to copy link")
    }
  }

  const formatExpiresAt = (isoString: string) => {
    const date = new Date(isoString)
    return date.toLocaleString()
  }

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
    <>
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Open menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() =>
                          setConfirmDialog({
                            open: true,
                            type: "reset-link",
                            user,
                          })
                        }
                      >
                        <KeyRound className="mr-2 h-4 w-4" />
                        Generate Reset Link
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {user.is_active ? (
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() =>
                            setConfirmDialog({
                              open: true,
                              type: "deactivate",
                              user,
                            })
                          }
                        >
                          <UserX className="mr-2 h-4 w-4" />
                          Deactivate
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() =>
                            setConfirmDialog({
                              open: true,
                              type: "activate",
                              user,
                            })
                          }
                        >
                          <UserCheck className="mr-2 h-4 w-4" />
                          Activate
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
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

      {/* Confirmation Dialog */}
      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) =>
          setConfirmDialog((prev) => ({ ...prev, open }))
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog.type === "reset-link" && "Generate Password Reset Link"}
              {confirmDialog.type === "activate" && "Activate User"}
              {confirmDialog.type === "deactivate" && "Deactivate User"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.type === "reset-link" && (
                <>
                  This will generate a password reset link for{" "}
                  <strong>{confirmDialog.user?.username}</strong>. The link will
                  expire in 24 hours.
                </>
              )}
              {confirmDialog.type === "activate" && (
                <>
                  Are you sure you want to activate{" "}
                  <strong>{confirmDialog.user?.username}</strong>? They will be
                  able to log in and use the platform.
                </>
              )}
              {confirmDialog.type === "deactivate" && (
                <>
                  Are you sure you want to deactivate{" "}
                  <strong>{confirmDialog.user?.username}</strong>? They will no
                  longer be able to log in.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirmDialog.type === "deactivate" ? "destructive" : "default"}
              onClick={handleConfirmAction}
              disabled={generateResetLink.isPending}
            >
              {generateResetLink.isPending ? "Generating..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Link Display Dialog */}
      <Dialog
        open={resetLinkDialog.open}
        onOpenChange={(open) =>
          setResetLinkDialog((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Password Reset Link</DialogTitle>
            <DialogDescription>
              Share this link with <strong>{resetLinkDialog.username}</strong> to
              allow them to reset their password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={resetLinkDialog.link}
                className="flex-1 bg-muted px-3 py-2 text-xs font-mono rounded-sm border border-border truncate"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Expires: {formatExpiresAt(resetLinkDialog.expiresAt)}
            </p>
          </div>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </>
  )
}

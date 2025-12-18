import * as React from "react"
import { Copy, Trash2 } from "lucide-react"
import type { InvitationResponse } from "@/types/invitation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
  formatInvitationStatus,
  getStatusBadgeVariant,
  formatInvitationDate,
  formatExpirationTime,
} from "@/lib/invitation-utils"

interface InvitationsTableProps {
  invitations: InvitationResponse[]
  isLoading: boolean
  onRevoke: (invitationId: string) => void
  onCopyLink: (token: string) => void
}

export function InvitationsTable({
  invitations,
  isLoading,
  onRevoke,
  onCopyLink,
}: InvitationsTableProps) {
  const [revokeDialogOpen, setRevokeDialogOpen] = React.useState(false)
  const [selectedInvitation, setSelectedInvitation] = React.useState<InvitationResponse | null>(null)

  const handleRevokeClick = (invitation: InvitationResponse) => {
    setSelectedInvitation(invitation)
    setRevokeDialogOpen(true)
  }

  const handleRevokeConfirm = () => {
    if (selectedInvitation) {
      onRevoke(selectedInvitation.id)
      setRevokeDialogOpen(false)
      setSelectedInvitation(null)
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3].map((i) => (
              <TableRow key={i}>
                <TableCell>
                  <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  if (!invitations || invitations.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center">
        <p className="text-sm text-muted-foreground">No invitations</p>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitations.map((invitation) => {
              const status = formatInvitationStatus(invitation)
              const variant = getStatusBadgeVariant(invitation)
              const canRevoke = status === "Pending"

              return (
                <TableRow key={invitation.id}>
                  <TableCell className="font-medium">{invitation.email}</TableCell>
                  <TableCell>
                    <Badge variant={variant}>{status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatInvitationDate(invitation.created_at)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatExpirationTime(invitation.expires_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onCopyLink(invitation.token)}
                        title="Copy Link"
                      >
                        <Copy className="size-4" />
                      </Button>
                      {canRevoke && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevokeClick(invitation)}
                          title="Revoke"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Invitation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke the invitation for{" "}
              <span className="font-medium">{selectedInvitation?.email}</span>? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevokeConfirm} variant="destructive">
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

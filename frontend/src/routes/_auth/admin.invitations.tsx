import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { useInvitations, useRevokeInvitation } from "@/api/invitations"
import { copyToClipboard } from "@/lib/clipboard"
import { buildInvitationLink } from "@/lib/invitation-utils"
import { toast } from "@/lib/toast"
import { getErrorMessage } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { CreateInvitationDialog } from "@/components/invitations/CreateInvitationDialog"
import { InvitationsTable } from "@/components/invitations/InvitationsTable"

export const Route = createFileRoute("/_auth/admin/invitations")({
  component: InvitationsPage
})

function InvitationsPage() {
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [page, setPage] = React.useState(1)

  const { data: invitations = [], isLoading } = useInvitations({ 
    page, 
    page_size: 10 
  })
  
  const revokeInvitation = useRevokeInvitation()

  const handleCopyLink = async (token: string) => {
    const link = buildInvitationLink(token)
    await copyToClipboard(link)
  }

  const handleRevoke = (invitationId: string) => {
    revokeInvitation.mutate(invitationId, {
      onSuccess: () => {
        toast.success("Invitation revoked successfully")
      },
      onError: (error) => {
        toast.error(getErrorMessage(error))
      }
    })
  }

  const hasNextPage = invitations.length === 10
  const hasPrevPage = page > 1

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Invitations</h1>
          <p className="text-muted-foreground">
            Manage user invitations and registration links
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 size-4" />
          Create Invitation
        </Button>
      </div>

      <InvitationsTable
        invitations={invitations}
        isLoading={isLoading}
        onRevoke={handleRevoke}
        onCopyLink={handleCopyLink}
      />

      {(hasNextPage || hasPrevPage) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => setPage((p) => p - 1)}
            disabled={!hasPrevPage}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page}</span>
          <Button
            variant="outline"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasNextPage}
          >
            Next
          </Button>
        </div>
      )}

      <CreateInvitationDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}

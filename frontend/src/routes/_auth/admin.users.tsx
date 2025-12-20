import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useUsers, useDeactivateUser, useActivateUser } from "@/api/users"
import { toast } from "@/lib/toast"
import { getErrorMessage } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { UsersTable } from "@/components/admin/UsersTable"

export const Route = createFileRoute("/_auth/admin/users")({
  component: AdminUsersPage
})

function AdminUsersPage() {
  const [page, setPage] = React.useState(1)

  const { data: users = [], isLoading } = useUsers({ 
    page, 
    page_size: 10 
  })
  
  const deactivateUser = useDeactivateUser()
  const activateUser = useActivateUser()

  const handleToggleStatus = (userId: string, currentStatus: boolean) => {
    const mutation = currentStatus ? deactivateUser : activateUser
    const actionLabel = currentStatus ? "deactivated" : "activated"

    mutation.mutate(userId, {
      onSuccess: () => {
        toast.success(`User ${actionLabel} successfully`)
      },
      onError: (error) => {
        toast.error(getErrorMessage(error))
      }
    })
  }

  const hasNextPage = users.length === 10
  const hasPrevPage = page > 1

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Users</h1>
          <p className="text-muted-foreground">
            Manage community members and their account status
          </p>
        </div>
      </div>

      <UsersTable
        users={users}
        isLoading={isLoading}
        onToggleStatus={handleToggleStatus}
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
    </div>
  )
}

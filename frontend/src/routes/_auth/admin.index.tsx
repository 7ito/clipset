import { createFileRoute, Navigate } from "@tanstack/react-router"

export const Route = createFileRoute("/_auth/admin/")({
  component: AdminIndex
})

function AdminIndex() {
  return <Navigate to="/admin/invitations" />
}

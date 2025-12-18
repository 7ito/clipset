import * as React from "react"
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router"
import { useAuth } from "@/hooks/useAuth"
import { AdminLayout } from "@/components/layout/AdminLayout"

export const Route = createFileRoute("/_auth/admin")({
  component: AdminPage
})

function AdminPage() {
  const { isAdmin, isLoading } = useAuth()
  const navigate = useNavigate()

  React.useEffect(() => {
    if (!isLoading && !isAdmin) {
      navigate({ to: "/dashboard" })
    }
  }, [isAdmin, isLoading, navigate])

  if (!isLoading && !isAdmin) {
    return null
  }

  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  )
}

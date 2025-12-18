import { createFileRoute, redirect, Outlet } from "@tanstack/react-router"
import { getToken } from "@/lib/auth"
import { AppLayout } from "@/components/layout/AppLayout"
import { Loading } from "@/components/common/Loading"
import { useAuth } from "@/hooks/useAuth"

export const Route = createFileRoute("/_auth")({
  beforeLoad: () => {
    const hasToken = getToken()
    if (!hasToken) {
      throw redirect({ to: "/login" })
    }
  },
  component: AuthLayout
})

function AuthLayout() {
  const { isLoading, isAuthenticated } = useAuth()

  if (isLoading) {
    return <Loading />
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  )
}

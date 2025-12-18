import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router"
import { useAuth } from "@/hooks/useAuth"
import { useMatches } from "@tanstack/react-router"

export const Route = createFileRoute("/_auth/profile")({
  component: ProfileLayout
})

function ProfileLayout() {
  const { user } = useAuth()
  const matches = useMatches()
  
  // Check if we're at the exact /profile path (no child route)
  const isExactProfileRoute = matches[matches.length - 1]?.id === "/_auth/profile"
  
  // If at /profile (no username), redirect to own profile
  if (isExactProfileRoute && user) {
    return (
      <Navigate
        to="/profile/$username"
        params={{ username: user.username }}
        replace
      />
    )
  }
  
  // Otherwise render the child route (profile/$username)
  return <Outlet />
}

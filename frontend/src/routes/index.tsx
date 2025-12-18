import { createFileRoute, redirect } from "@tanstack/react-router"
import { getToken } from "@/lib/auth"

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    const hasToken = getToken()
    if (hasToken) {
      throw redirect({ to: "/dashboard" })
    } else {
      throw redirect({ to: "/login" })
    }
  }
})

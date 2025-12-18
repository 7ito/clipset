import { createRootRoute, Outlet } from "@tanstack/react-router"
import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { TanStackRouterDevtools } from "@tanstack/router-devtools"
import { Toaster } from "sonner"
import { queryClient } from "@/lib/query-client"
import { AuthProvider } from "@/contexts/auth-context"
import { ThemeProvider } from "@/contexts/theme-context"

export const Route = createRootRoute({
  component: RootComponent
})

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <Outlet />
          <Toaster position="top-right" richColors />
          {import.meta.env.DEV && (
            <>
              <ReactQueryDevtools initialIsOpen={false} />
              <TanStackRouterDevtools position="bottom-right" />
            </>
          )}
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

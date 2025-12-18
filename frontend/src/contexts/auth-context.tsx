import * as React from "react"
import { useCurrentUser } from "@/api/auth"
import { getToken } from "@/lib/auth"
import type { UserWithQuota } from "@/types/user"

interface AuthContextValue {
  user: UserWithQuota | null
  isLoading: boolean
  isAuthenticated: boolean
  isAdmin: boolean
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const hasToken = !!getToken()
  const { data: user, isLoading } = useCurrentUser()
  
  const value: AuthContextValue = {
    user: user || null,
    isLoading: hasToken && isLoading,
    isAuthenticated: hasToken && !!user,
    isAdmin: user?.role === "admin"
  }
  
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = React.useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

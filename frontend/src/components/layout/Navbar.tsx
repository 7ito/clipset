import { Link, useNavigate } from "@tanstack/react-router"
import { LogOut, User, Moon, Sun, Menu, X, Home, Upload as UploadIcon, Shield, FolderOpen } from "lucide-react"
import { useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import { useTheme } from "@/contexts/theme-context"
import { useLogout } from "@/api/auth"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { toast } from "@/lib/toast"

export function Navbar() {
  const { user, isAdmin } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const logout = useLogout()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        toast.success("Logged out successfully")
        window.location.href = "/login"
      }
    })
  }

  if (!user) return null

  return (
    <nav className="border-b border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/dashboard" className="text-lg font-semibold">
              Clipset
            </Link>
            
            <div className="hidden md:flex items-center gap-4">
              <Link
                to="/dashboard"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Home
              </Link>
              <Link
                to="/categories"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Categories
              </Link>
              <Link
                to="/upload"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Upload
              </Link>
              {isAdmin && (
                <Link
                  to="/admin"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Admin
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            >
              {theme === "light" ? (
                <Moon className="size-4" />
              ) : (
                <Sun className="size-4" />
              )}
            </Button>

            <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <User className="mr-2 size-4" />
                {user.username}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{user.username}</span>
                  <span className="text-xs text-muted-foreground">{user.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem 
                  onClick={() => {
                    navigate({ to: "/profile/$username", params: { username: user.username } })
                  }}
                >
                  <User />
                  Profile
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Mobile slide-down menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b bg-background shadow-xl animate-in slide-in-from-top duration-300">
          <nav className="px-4 py-6 space-y-3">
            <Link
              to="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-4 px-4 py-3 rounded-xl text-base font-medium hover:bg-accent transition-all active:scale-95"
            >
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Home className="w-5 h-5" />
              </div>
              <span>Home</span>
            </Link>
            <Link
              to="/categories"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-4 px-4 py-3 rounded-xl text-base font-medium hover:bg-accent transition-all active:scale-95"
            >
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <FolderOpen className="w-5 h-5" />
              </div>
              <span>Categories</span>
            </Link>
            <Link
              to="/upload"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-4 px-4 py-3 rounded-xl text-base font-medium hover:bg-accent transition-all active:scale-95"
            >
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <UploadIcon className="w-5 h-5" />
              </div>
              <span>Upload</span>
            </Link>
            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-4 px-4 py-3 rounded-xl text-base font-medium hover:bg-accent transition-all active:scale-95"
              >
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Shield className="w-5 h-5" />
                </div>
                <span>Admin</span>
              </Link>
            )}
            
            <div className="pt-4 border-t mt-4">
              <Link
                to="/profile/$username"
                params={{ username: user.username }}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-4 px-4 py-3 rounded-xl text-base font-medium hover:bg-accent transition-all active:scale-95"
              >
                <div className="p-2 rounded-lg bg-muted text-muted-foreground">
                  <User className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <span>Profile</span>
                  <span className="text-xs text-muted-foreground font-normal">{user.username}</span>
                </div>
              </Link>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-base font-medium hover:bg-destructive/10 text-destructive transition-all active:scale-95 mt-2"
              >
                <div className="p-2 rounded-lg bg-destructive/10">
                  <LogOut className="w-5 h-5" />
                </div>
                <span>Logout</span>
              </button>
            </div>
          </nav>
        </div>
      )}
    </nav>
  )
}

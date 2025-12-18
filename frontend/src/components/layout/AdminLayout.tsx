import { Link, useLocation } from "@tanstack/react-router"
import { Users, FolderKanban } from "lucide-react"
import { cn } from "@/lib/utils"

interface AdminLayoutProps {
  children: React.ReactNode
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const location = useLocation()
  
  const navItems = [
    {
      title: "Invitations",
      href: "/admin/invitations",
      icon: Users,
    },
    {
      title: "Categories",
      href: "/admin/categories",
      icon: FolderKanban,
    },
    // Add more admin sections here as needed
    // {
    //   title: "Settings",
    //   href: "/admin/settings",
    //   icon: Settings,
    // },
  ]

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-muted/10">
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4">Admin Panel</h2>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.href
              const Icon = item.icon
              
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="size-4" />
                  {item.title}
                </Link>
              )
            })}
          </nav>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6">
        {children}
      </main>
    </div>
  )
}

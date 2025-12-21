import type { ReactNode } from "react"

interface PageHeaderProps {
  title: string
  description?: string
  action?: ReactNode
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between border-l-4 border-primary/40 dark:border-primary pl-6 py-2 dark:bg-gradient-to-r from-primary/5 to-transparent">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight dark:text-glow">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider opacity-80">
            {description}
          </p>
        )}
      </div>
      {action && (
        <div className="flex items-center gap-2">
          {action}
        </div>
      )}
    </div>
  )
}

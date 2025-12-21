import { cn } from "@/lib/utils"

interface UserAvatarProps {
  username: string
  avatarUrl?: string
  className?: string
  size?: "sm" | "md" | "lg" | "xl"
}

export function UserAvatar({ username, avatarUrl, className, size = "md" }: UserAvatarProps) {
  // Generate initials from username
  const parts = username.split(/[_-]/)
  const initials = parts
    .map(part => part[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join("")

  // Generate a gradient based on username for consistency
  const gradients = [
    "from-teal-500 to-cyan-600",
    "from-emerald-500 to-teal-600",
    "from-cyan-500 to-blue-600",
    "from-teal-400 to-emerald-500",
    "from-emerald-400 to-cyan-500",
    "from-cyan-400 to-teal-500",
    "from-teal-600 to-emerald-700",
    "from-emerald-600 to-cyan-700",
  ]
  const gradientIndex = username.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % gradients.length
  const gradient = gradients[gradientIndex]

  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-16 h-16 text-xl",
    xl: "w-24 h-24 text-3xl",
  }

  return (
    <div className={cn(
      "rounded-full flex items-center justify-center font-bold text-white shadow-md transition-transform duration-300 overflow-hidden bg-muted",
      !avatarUrl && gradient,
      !avatarUrl && "bg-gradient-to-br",
      sizeClasses[size],
      className
    )}>
      {avatarUrl ? (
        <img 
          src={avatarUrl} 
          alt={username} 
          className="w-full h-full object-cover"
          onError={(e) => {
            // Fallback if image fails to load
            e.currentTarget.style.display = 'none'
            e.currentTarget.parentElement?.classList.add(...gradient.split(' '))
            e.currentTarget.parentElement?.classList.add('bg-gradient-to-br')
          }}
        />
      ) : (
        initials || username[0]?.toUpperCase() || "?"
      )}
    </div>
  )
}

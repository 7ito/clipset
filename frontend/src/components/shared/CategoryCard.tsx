import { Link } from "@tanstack/react-router"
import type { Category } from "@/types/category"
import { Play } from "lucide-react"

interface CategoryCardProps {
  category: Category
}

// Generate a gradient based on category name (for consistent colors)
function generateGradient(name: string): string {
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
  
  const index = name.charCodeAt(0) % gradients.length
  return gradients[index]
}

export function CategoryCard({ category }: CategoryCardProps) {
  const gradient = generateGradient(category.name)
  
  return (
    <Link
      to="/categories/$slug"
      params={{ slug: category.slug }}
      className="group block"
    >
      <div className="relative overflow-hidden rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-xl">
        {/* Image or Gradient Background */}
        <div className="aspect-square relative">
          {category.image_url ? (
            <img
              src={category.image_url}
              alt={category.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${gradient}`} />
          )}
          
          {/* Overlay on hover */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200" />
          
          {/* Video count badge */}
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-black/75 text-white text-sm font-medium px-2.5 py-1 rounded-md backdrop-blur-sm">
            <Play className="w-3.5 h-3.5" />
            <span>{category.video_count}</span>
          </div>
        </div>
        
        {/* Category info */}
        <div className="p-4 bg-card border-x border-b rounded-b-lg">
          <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
            {category.name}
          </h3>
          {category.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {category.description}
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}

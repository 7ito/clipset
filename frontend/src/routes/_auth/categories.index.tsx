import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useState, useMemo } from "react"
import { getCategories } from "@/api/categories"
import { CategoryCard } from "@/components/shared/CategoryCard"
import { PageHeader } from "@/components/shared/PageHeader"
import { EmptyState } from "@/components/shared/EmptyState"
import { LoadingSpinner } from "@/components/shared/LoadingSpinner"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, FolderOpen } from "lucide-react"

export const Route = createFileRoute("/_auth/categories/")({
  component: CategoriesBrowsePage
})

type SortOption = "alphabetical" | "most-videos"

function CategoriesBrowsePage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<SortOption>("alphabetical")

  // Fetch categories
  const { data, isLoading, error } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  })

  // Filter and sort categories
  const filteredAndSortedCategories = useMemo(() => {
    if (!data?.categories) return []

    let result = [...data.categories]

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (category) =>
          category.name.toLowerCase().includes(query) ||
          category.description?.toLowerCase().includes(query)
      )
    }

    // Sort
    if (sortBy === "alphabetical") {
      result.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortBy === "most-videos") {
      result.sort((a, b) => b.video_count - a.video_count)
    }

    return result
  }, [data?.categories, searchQuery, sortBy])

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-destructive">Error loading categories</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Categories" 
        description={`Browse ${data?.total || 0} video categories`}
      />

      {/* Unified Filter Bar */}
      <div className="flex flex-col md:flex-row gap-0 border border-border bg-card/50 backdrop-blur-sm shadow-sm group/filterbar focus-within:border-primary/50 transition-all duration-300">
        <div className="flex-1 flex items-center relative border-b md:border-b-0 md:border-r border-border focus-within:bg-card transition-colors">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40 group-focus-within/filterbar:text-primary transition-colors pointer-events-none" />
          <Input
            placeholder="Search categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11 border-none bg-transparent focus-visible:ring-0 placeholder:text-foreground/40 text-[13px] font-medium"
          />
        </div>
        
        <div className="flex items-center px-4 h-11 bg-muted/20">
          <span className="text-[10px] uppercase tracking-wider font-bold text-foreground/30 mr-3 shrink-0">Sort By</span>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
            <SelectTrigger className="h-9 border-none bg-transparent focus:ring-0 hover:bg-transparent text-[12px] font-semibold min-w-[140px] px-1 justify-start gap-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alphabetical">A - Z</SelectItem>
              <SelectItem value="most-videos">Most Content</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-square bg-muted rounded-lg mb-4" />
              <div className="h-6 bg-muted rounded w-3/4 mb-2" />
              <div className="h-4 bg-muted rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Categories Grid */}
      {!isLoading && filteredAndSortedCategories.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredAndSortedCategories.map((category) => (
            <CategoryCard key={category.id} category={category} />
          ))}
        </div>
      )}

      {/* Empty States */}
      {!isLoading && data?.categories.length === 0 && (
        <EmptyState
          icon={FolderOpen}
          title="No categories yet"
          description="Categories will appear here once they are created"
        />
      )}

      {!isLoading && data?.categories && data.categories.length > 0 && filteredAndSortedCategories.length === 0 && (
        <EmptyState
          icon={Search}
          title="No categories found"
          description={`No categories match "${searchQuery}"`}
        />
      )}
    </div>
  )
}

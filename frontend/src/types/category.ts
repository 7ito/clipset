/**
 * TypeScript types for Category entities
 */

export interface Category {
  id: string
  name: string
  slug: string
  created_by: string
  created_at: string
  video_count: number
}

export interface CategoryCreate {
  name: string
}

export interface CategoryUpdate {
  name: string
}

export interface CategoryListResponse {
  categories: Category[]
  total: number
}

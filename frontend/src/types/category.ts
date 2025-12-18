/**
 * TypeScript types for Category entities
 */

export interface Category {
  id: string
  name: string
  slug: string
  description: string | null
  image_filename: string | null
  image_url: string | null
  created_by: string
  created_at: string
  updated_at: string | null
  video_count: number
}

export interface CategoryCreate {
  name: string
  description?: string
}

export interface CategoryUpdate {
  name?: string
  description?: string
}

export interface CategoryListResponse {
  categories: Category[]
  total: number
}

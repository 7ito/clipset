/**
 * Category API client functions
 */

import type { Category, CategoryCreate, CategoryUpdate, CategoryListResponse } from "@/types/category"
import { apiClient } from "@/lib/api-client"

/**
 * Get all categories with video counts
 */
export async function getCategories(): Promise<CategoryListResponse> {
  const response = await apiClient.get<CategoryListResponse>("/api/categories/")
  return response.data
}

/**
 * Get a single category by ID
 */
export async function getCategory(id: string): Promise<Category> {
  const response = await apiClient.get<Category>(`/api/categories/${id}`)
  return response.data
}

/**
 * Get a category by slug (for clean URLs)
 */
export async function getCategoryBySlug(slug: string): Promise<Category> {
  const response = await apiClient.get<Category>(`/api/categories/slug/${slug}`)
  return response.data
}

/**
 * Create a new category (admin only)
 */
export async function createCategory(data: CategoryCreate): Promise<Category> {
  const response = await apiClient.post<Category>("/api/categories/", data)
  return response.data
}

/**
 * Update a category (admin only)
 */
export async function updateCategory(id: string, data: CategoryUpdate): Promise<Category> {
  const response = await apiClient.patch<Category>(`/api/categories/${id}`, data)
  return response.data
}

/**
 * Delete a category (admin only)
 */
export async function deleteCategory(id: string): Promise<void> {
  await apiClient.delete(`/api/categories/${id}`)
}

/**
 * Upload image for a category (admin only)
 * @param id - Category ID
 * @param file - Image file (will be resized to 400x400 and converted to WebP)
 */
export async function uploadCategoryImage(id: string, file: File): Promise<Category> {
  const formData = new FormData()
  formData.append("file", file)
  
  const response = await apiClient.post<Category>(
    `/api/categories/${id}/image`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    }
  )
  return response.data
}

/**
 * Delete category image (admin only)
 */
export async function deleteCategoryImage(id: string): Promise<void> {
  await apiClient.delete(`/api/categories/${id}/image`)
}

/**
 * Get category image URL
 * Now served directly by nginx for better performance
 */
export function getCategoryImageUrl(filename: string): string {
  return `/media/category-images/${filename}`
}

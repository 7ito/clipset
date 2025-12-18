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

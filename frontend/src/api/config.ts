import { apiClient } from "@/lib/api-client"
import type { SystemConfig, ConfigUpdate } from "@/types/config"

/**
 * Get current system configuration (admin only)
 */
export async function getConfig(): Promise<SystemConfig> {
  const response = await apiClient.get("/api/config/")
  return response.data
}

/**
 * Update system configuration (admin only)
 */
export async function updateConfig(updates: ConfigUpdate): Promise<SystemConfig> {
  const response = await apiClient.patch("/api/config/", updates)
  return response.data
}

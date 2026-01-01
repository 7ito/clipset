import { apiClient } from "@/lib/api-client"
import type { SystemConfig, ConfigUpdate, EncoderInfo } from "@/types/config"

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

/**
 * Get available video encoders (admin only)
 */
export async function getEncoders(): Promise<EncoderInfo> {
  const response = await apiClient.get("/api/config/encoders")
  return response.data
}

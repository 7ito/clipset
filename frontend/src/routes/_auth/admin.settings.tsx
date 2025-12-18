import { createFileRoute } from "@tanstack/react-router"
import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Settings, Save, RotateCcw, Info } from "lucide-react"
import { getConfig, updateConfig } from "@/api/config"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/shared/PageHeader"
import { LoadingSpinner } from "@/components/shared/LoadingSpinner"
import { FileSizeInput } from "@/components/admin/FileSizeInput"
import { PathInput } from "@/components/admin/PathInput"
import { toast } from "@/lib/toast"
import type { ConfigUpdate } from "@/types/config"

export const Route = createFileRoute("/_auth/admin/settings")({
  component: AdminSettingsPage
})

function AdminSettingsPage() {
  const queryClient = useQueryClient()
  
  // Local state for form fields
  const [maxFileSize, setMaxFileSize] = useState(0)
  const [weeklyLimit, setWeeklyLimit] = useState(0)
  const [storagePath, setStoragePath] = useState("")
  const [hasChanges, setHasChanges] = useState(false)

  // Fetch current config
  const { data: config, isLoading, error } = useQuery({
    queryKey: ["admin", "config"],
    queryFn: getConfig
  })

  // Initialize form state when config loads
  useEffect(() => {
    if (config) {
      setMaxFileSize(config.max_file_size_bytes)
      setWeeklyLimit(config.weekly_upload_limit_bytes)
      setStoragePath(config.video_storage_path)
    }
  }, [config])

  // Track changes
  useEffect(() => {
    if (!config) return
    
    const changed = 
      maxFileSize !== config.max_file_size_bytes ||
      weeklyLimit !== config.weekly_upload_limit_bytes ||
      storagePath !== config.video_storage_path
    
    setHasChanges(changed)
  }, [maxFileSize, weeklyLimit, storagePath, config])

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: updateConfig,
    onSuccess: () => {
      toast.success("Settings updated successfully")
      queryClient.invalidateQueries({ queryKey: ["admin", "config"] })
      setHasChanges(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Failed to update settings")
    }
  })

  const handleSave = () => {
    const updates: ConfigUpdate = {}
    
    if (config) {
      if (maxFileSize !== config.max_file_size_bytes) {
        updates.max_file_size_bytes = maxFileSize
      }
      if (weeklyLimit !== config.weekly_upload_limit_bytes) {
        updates.weekly_upload_limit_bytes = weeklyLimit
      }
      if (storagePath !== config.video_storage_path) {
        updates.video_storage_path = storagePath
      }
    }

    if (Object.keys(updates).length === 0) {
      toast.error("No changes to save")
      return
    }

    updateMutation.mutate(updates)
  }

  const handleReset = () => {
    if (config) {
      setMaxFileSize(config.max_file_size_bytes)
      setWeeklyLimit(config.weekly_upload_limit_bytes)
      setStoragePath(config.video_storage_path)
      setHasChanges(false)
    }
  }

  if (isLoading) {
    return <LoadingSpinner size="lg" text="Loading settings..." />
  }

  if (error || !config) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive">Failed to load system settings</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Settings"
        description="Configure upload limits, storage paths, and other system settings"
      />

      {/* Info Banner */}
      <Card className="border-blue-500/50 bg-blue-500/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm space-y-1">
              <p className="font-medium text-blue-500">Important Information</p>
              <p className="text-muted-foreground">
                Most settings apply immediately. Changes to storage paths will affect new uploads only.
                Existing videos will remain in their current locations.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload & Storage Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Upload & Storage Settings
          </CardTitle>
          <CardDescription>
            Configure file size limits, upload quotas, and storage locations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <FileSizeInput
            label="Max File Size"
            value={maxFileSize}
            onChange={setMaxFileSize}
            helperText="Maximum file size for a single video upload (1MB - 10GB)"
          />

          <FileSizeInput
            label="Weekly Upload Limit"
            value={weeklyLimit}
            onChange={setWeeklyLimit}
            helperText="Maximum total upload size per user per week (1MB - 100GB)"
          />

          <PathInput
            label="Video Storage Path"
            value={storagePath}
            onChange={setStoragePath}
            helperText="Absolute or relative path where uploaded videos are stored"
            placeholder="/data/uploads/videos"
          />
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center justify-between gap-4 sticky bottom-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-4 border-t">
        <div className="flex-1">
          {hasChanges && (
            <p className="text-sm text-muted-foreground">
              You have unsaved changes
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={!hasChanges || updateMutation.isPending}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || updateMutation.isPending}
          >
            <Save className="w-4 h-4 mr-2" />
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  )
}

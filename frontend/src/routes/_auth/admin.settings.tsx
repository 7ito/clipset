import { createFileRoute } from "@tanstack/react-router"
import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Settings, Save, RotateCcw, Info, AlertTriangle } from "lucide-react"
import { getConfig, updateConfig, getEncoders } from "@/api/config"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/shared/PageHeader"
import { LoadingSpinner } from "@/components/shared/LoadingSpinner"
import { FileSizeInput } from "@/components/admin/FileSizeInput"
import { PathInput } from "@/components/admin/PathInput"
import { TranscodingSettings } from "@/components/admin/TranscodingSettings"
import { toast } from "@/lib/toast"
import type { ConfigUpdate, SystemConfig } from "@/types/config"

export const Route = createFileRoute("/_auth/admin/settings")({
  component: AdminSettingsPage
})

function AdminSettingsPage() {
  const queryClient = useQueryClient()
  
  // Local state for form fields - upload/storage
  const [maxFileSize, setMaxFileSize] = useState(0)
  const [weeklyLimit, setWeeklyLimit] = useState(0)
  const [storagePath, setStoragePath] = useState("")

  // Local state for transcoding settings
  const [transcodingConfig, setTranscodingConfig] = useState<Partial<SystemConfig>>({})
  
  const [hasChanges, setHasChanges] = useState(false)

  // Fetch current config
  const { data: config, isLoading, error } = useQuery({
    queryKey: ["admin", "config"],
    queryFn: getConfig
  })

  // Fetch encoder info for GPU validation
  const { data: encoderInfo } = useQuery({
    queryKey: ["admin", "encoders"],
    queryFn: getEncoders
  })

  // Initialize form state when config loads
  useEffect(() => {
    if (config) {
      setMaxFileSize(config.max_file_size_bytes)
      setWeeklyLimit(config.weekly_upload_limit_bytes)
      setStoragePath(config.video_storage_path)
      setTranscodingConfig({
        use_gpu_transcoding: config.use_gpu_transcoding,
        gpu_device_id: config.gpu_device_id,
        nvenc_preset: config.nvenc_preset,
        nvenc_cq: config.nvenc_cq,
        nvenc_rate_control: config.nvenc_rate_control,
        nvenc_max_bitrate: config.nvenc_max_bitrate,
        nvenc_buffer_size: config.nvenc_buffer_size,
        cpu_preset: config.cpu_preset,
        cpu_crf: config.cpu_crf,
        max_resolution: config.max_resolution,
        audio_bitrate: config.audio_bitrate,
        transcode_preset_mode: config.transcode_preset_mode,
      })
    }
  }, [config])

  // Track changes
  useEffect(() => {
    if (!config) return
    
    const uploadStorageChanged = 
      maxFileSize !== config.max_file_size_bytes ||
      weeklyLimit !== config.weekly_upload_limit_bytes ||
      storagePath !== config.video_storage_path

    const transcodingChanged =
      transcodingConfig.use_gpu_transcoding !== config.use_gpu_transcoding ||
      transcodingConfig.gpu_device_id !== config.gpu_device_id ||
      transcodingConfig.nvenc_preset !== config.nvenc_preset ||
      transcodingConfig.nvenc_cq !== config.nvenc_cq ||
      transcodingConfig.nvenc_rate_control !== config.nvenc_rate_control ||
      transcodingConfig.nvenc_max_bitrate !== config.nvenc_max_bitrate ||
      transcodingConfig.nvenc_buffer_size !== config.nvenc_buffer_size ||
      transcodingConfig.cpu_preset !== config.cpu_preset ||
      transcodingConfig.cpu_crf !== config.cpu_crf ||
      transcodingConfig.max_resolution !== config.max_resolution ||
      transcodingConfig.audio_bitrate !== config.audio_bitrate ||
      transcodingConfig.transcode_preset_mode !== config.transcode_preset_mode
    
    setHasChanges(uploadStorageChanged || transcodingChanged)
  }, [maxFileSize, weeklyLimit, storagePath, transcodingConfig, config])

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

  // Handler for transcoding config updates
  function handleTranscodingUpdate(field: string, value: unknown) {
    setTranscodingConfig(prev => ({
      ...prev,
      [field]: value
    }))
  }

  // Validation: Check if GPU is enabled but not available
  const gpuValidationError = 
    transcodingConfig.use_gpu_transcoding && 
    encoderInfo && 
    !encoderInfo.gpu_available

  const handleSave = () => {
    // Block save if GPU validation fails
    if (gpuValidationError) {
      toast.error("Cannot save: GPU transcoding is enabled but no GPU encoder is available")
      return
    }

    const updates: ConfigUpdate = {}
    
    if (config) {
      // Upload/Storage changes
      if (maxFileSize !== config.max_file_size_bytes) {
        updates.max_file_size_bytes = maxFileSize
      }
      if (weeklyLimit !== config.weekly_upload_limit_bytes) {
        updates.weekly_upload_limit_bytes = weeklyLimit
      }
      if (storagePath !== config.video_storage_path) {
        updates.video_storage_path = storagePath
      }

      // Transcoding changes
      if (transcodingConfig.use_gpu_transcoding !== config.use_gpu_transcoding) {
        updates.use_gpu_transcoding = transcodingConfig.use_gpu_transcoding
      }
      if (transcodingConfig.gpu_device_id !== config.gpu_device_id) {
        updates.gpu_device_id = transcodingConfig.gpu_device_id
      }
      if (transcodingConfig.nvenc_preset !== config.nvenc_preset) {
        updates.nvenc_preset = transcodingConfig.nvenc_preset
      }
      if (transcodingConfig.nvenc_cq !== config.nvenc_cq) {
        updates.nvenc_cq = transcodingConfig.nvenc_cq
      }
      if (transcodingConfig.nvenc_rate_control !== config.nvenc_rate_control) {
        updates.nvenc_rate_control = transcodingConfig.nvenc_rate_control
      }
      if (transcodingConfig.nvenc_max_bitrate !== config.nvenc_max_bitrate) {
        updates.nvenc_max_bitrate = transcodingConfig.nvenc_max_bitrate
      }
      if (transcodingConfig.nvenc_buffer_size !== config.nvenc_buffer_size) {
        updates.nvenc_buffer_size = transcodingConfig.nvenc_buffer_size
      }
      if (transcodingConfig.cpu_preset !== config.cpu_preset) {
        updates.cpu_preset = transcodingConfig.cpu_preset
      }
      if (transcodingConfig.cpu_crf !== config.cpu_crf) {
        updates.cpu_crf = transcodingConfig.cpu_crf
      }
      if (transcodingConfig.max_resolution !== config.max_resolution) {
        updates.max_resolution = transcodingConfig.max_resolution
      }
      if (transcodingConfig.audio_bitrate !== config.audio_bitrate) {
        updates.audio_bitrate = transcodingConfig.audio_bitrate
      }
      if (transcodingConfig.transcode_preset_mode !== config.transcode_preset_mode) {
        updates.transcode_preset_mode = transcodingConfig.transcode_preset_mode
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
      setTranscodingConfig({
        use_gpu_transcoding: config.use_gpu_transcoding,
        gpu_device_id: config.gpu_device_id,
        nvenc_preset: config.nvenc_preset,
        nvenc_cq: config.nvenc_cq,
        nvenc_rate_control: config.nvenc_rate_control,
        nvenc_max_bitrate: config.nvenc_max_bitrate,
        nvenc_buffer_size: config.nvenc_buffer_size,
        cpu_preset: config.cpu_preset,
        cpu_crf: config.cpu_crf,
        max_resolution: config.max_resolution,
        audio_bitrate: config.audio_bitrate,
        transcode_preset_mode: config.transcode_preset_mode,
      })
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

  // Merge local state with config for TranscodingSettings
  const mergedConfig: SystemConfig = {
    ...config,
    ...transcodingConfig,
  } as SystemConfig

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Settings"
        description="Configure upload limits, storage paths, and transcoding settings"
      />

      {/* Info Banner */}
      <Card className="border-blue-500/50 bg-blue-500/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm space-y-1">
              <p className="font-medium text-blue-500">Important Information</p>
              <p className="text-muted-foreground">
                Upload and storage settings apply immediately. Transcoding settings
                only affect new uploads - existing videos will not be re-transcoded.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* GPU Validation Error Banner */}
      {gpuValidationError && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
              <div className="text-sm space-y-1">
                <p className="font-medium text-destructive">GPU Transcoding Unavailable</p>
                <p className="text-muted-foreground">
                  GPU transcoding is enabled but no GPU encoder was detected on this system.
                  Please disable GPU transcoding or ensure NVIDIA drivers and NVENC are properly installed.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Transcoding Settings */}
      <TranscodingSettings
        config={mergedConfig}
        onUpdate={handleTranscodingUpdate}
        disabled={updateMutation.isPending}
      />

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
            disabled={!hasChanges || updateMutation.isPending || gpuValidationError}
          >
            <Save className="w-4 h-4 mr-2" />
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  )
}

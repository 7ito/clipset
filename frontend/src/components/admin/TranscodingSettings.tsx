import { useQuery } from "@tanstack/react-query"
import {
  Cpu,
  Gpu,
  Monitor,
  Volume2,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Info,
} from "lucide-react"
import { getEncoders } from "@/api/config"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import type { SystemConfig, PresetMode } from "@/types/config"
import { TRANSCODING_PRESETS } from "@/types/config"

interface TranscodingSettingsProps {
  config: SystemConfig
  onUpdate: (field: string, value: unknown) => void
  disabled?: boolean
}

// Quality descriptions for CQ/CRF values
function getQualityLabel(value: number): string {
  if (value <= 14) return "Near lossless"
  if (value <= 17) return "High quality"
  if (value <= 20) return "Good quality"
  if (value <= 25) return "Acceptable"
  return "Low quality"
}

// NVENC preset descriptions
const NVENC_PRESET_LABELS: Record<string, string> = {
  p1: "Fastest",
  p2: "Faster",
  p3: "Fast",
  p4: "Balanced",
  p5: "Slow",
  p6: "Slower",
  p7: "Slowest (Best)",
}

// CPU preset descriptions
const CPU_PRESET_LABELS: Record<string, string> = {
  ultrafast: "Ultrafast",
  superfast: "Superfast",
  veryfast: "Very Fast",
  faster: "Faster",
  fast: "Fast",
  medium: "Medium (Recommended)",
  slow: "Slow",
  slower: "Slower",
  veryslow: "Very Slow (Best)",
}

// Resolution labels
const RESOLUTION_LABELS: Record<string, string> = {
  "720p": "720p (1280x720)",
  "1080p": "1080p (1920x1080)",
  "1440p": "1440p (2560x1440)",
  "4k": "4K (3840x2160)",
}

// Audio bitrate labels
const AUDIO_BITRATE_OPTIONS = ["128k", "192k", "256k", "320k"]

export function TranscodingSettings({
  config,
  onUpdate,
  disabled = false,
}: TranscodingSettingsProps) {
  // Fetch encoder info
  const {
    data: encoderInfo,
    isLoading: encodersLoading,
    error: encodersError,
  } = useQuery({
    queryKey: ["admin", "encoders"],
    queryFn: getEncoders,
  })

  const isCustomMode = config.transcode_preset_mode === "custom"
  const gpuAvailable = encoderInfo?.gpu_available ?? false

  // Handle preset mode change
  function handlePresetChange(mode: PresetMode) {
    onUpdate("transcode_preset_mode", mode)

    // If not custom, apply preset values
    if (mode !== "custom") {
      const presetValues = TRANSCODING_PRESETS[mode]
      Object.entries(presetValues).forEach(([key, value]) => {
        onUpdate(key, value)
      })
    }
  }

  // Validate GPU toggle - block if GPU not available
  function handleGpuToggle(enabled: boolean) {
    if (enabled && !gpuAvailable) {
      // Don't allow enabling if GPU not available
      return
    }
    onUpdate("use_gpu_transcoding", enabled)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Monitor className="w-5 h-5" />
          Transcoding Settings
        </CardTitle>
        <CardDescription>
          Configure video transcoding quality and performance. Changes only affect new uploads.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Preset Mode Selection */}
        <Field>
          <FieldLabel>Preset Mode</FieldLabel>
          <RadioGroup
            value={config.transcode_preset_mode}
            onValueChange={(value) => handlePresetChange(value as PresetMode)}
            className="flex flex-wrap gap-4 pt-2"
            disabled={disabled}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="quality" id="quality" />
              <Label htmlFor="quality" className="cursor-pointer">
                Quality
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="balanced" id="balanced" />
              <Label htmlFor="balanced" className="cursor-pointer">
                Balanced
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="performance" id="performance" />
              <Label htmlFor="performance" className="cursor-pointer">
                Performance
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="custom" id="custom" />
              <Label htmlFor="custom" className="cursor-pointer">
                Custom
              </Label>
            </div>
          </RadioGroup>
          <FieldDescription>
            {config.transcode_preset_mode === "quality" &&
              "Best quality, larger files, slower encoding"}
            {config.transcode_preset_mode === "balanced" &&
              "Good balance of quality, size, and speed (recommended)"}
            {config.transcode_preset_mode === "performance" &&
              "Faster encoding, smaller files, acceptable quality"}
            {config.transcode_preset_mode === "custom" &&
              "Full control over all transcoding parameters"}
          </FieldDescription>
        </Field>

        {/* GPU Acceleration Section */}
        <div className="space-y-4 pt-4 border-t">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Gpu className="w-4 h-4" />
            GPU Acceleration
          </h4>

          {/* GPU Detection Status */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            {encodersLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Detecting GPU encoders...</span>
              </>
            ) : encodersError ? (
              <>
                <XCircle className="w-4 h-4 text-destructive" />
                <span className="text-sm text-destructive">Failed to detect encoders</span>
              </>
            ) : gpuAvailable ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm">
                  {encoderInfo?.gpu_name || "NVIDIA GPU"} detected
                  <span className="text-muted-foreground ml-1">
                    ({encoderInfo?.encoders.filter((e) => e.includes("nvenc")).join(", ")})
                  </span>
                </span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  No GPU encoder detected - CPU transcoding will be used
                </span>
              </>
            )}
          </div>

          {/* GPU Toggle */}
          <Field>
            <div className="flex items-center justify-between">
              <div>
                <FieldLabel>Enable GPU Transcoding</FieldLabel>
                <FieldDescription>
                  Use NVIDIA NVENC for faster video transcoding
                </FieldDescription>
              </div>
              <Switch
                checked={config.use_gpu_transcoding}
                onCheckedChange={handleGpuToggle}
                disabled={disabled || !gpuAvailable}
              />
            </div>
          </Field>

          {/* Warning if GPU enabled but not available */}
          {config.use_gpu_transcoding && !gpuAvailable && !encodersLoading && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p className="text-sm">
                GPU transcoding is enabled but no GPU encoder was detected.
                Please disable GPU transcoding or ensure NVIDIA drivers are installed.
              </p>
            </div>
          )}

          {/* NVENC Settings (only shown in custom mode and when GPU enabled) */}
          {isCustomMode && config.use_gpu_transcoding && (
            <div className="space-y-4 pl-4 border-l-2 border-muted">
              {/* NVENC Preset */}
              <Field>
                <FieldLabel>NVENC Preset</FieldLabel>
                <Select
                  value={config.nvenc_preset}
                  onValueChange={(value) => onUpdate("nvenc_preset", value)}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(NVENC_PRESET_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {value} - {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Lower presets are faster, higher presets produce better quality
                </FieldDescription>
              </Field>

              {/* NVENC Quality (CQ) */}
              <Field>
                <div className="flex items-center justify-between">
                  <FieldLabel>Quality (CQ)</FieldLabel>
                  <span className="text-sm text-muted-foreground">
                    {config.nvenc_cq} - {getQualityLabel(config.nvenc_cq)}
                  </span>
                </div>
                <Slider
                  value={[config.nvenc_cq]}
                  onValueChange={([value]) => onUpdate("nvenc_cq", value)}
                  min={0}
                  max={51}
                  step={1}
                  disabled={disabled}
                />
                <FieldDescription>
                  Lower values = better quality, larger files (16-18 recommended)
                </FieldDescription>
              </Field>

              {/* Rate Control */}
              <Field>
                <FieldLabel>Rate Control</FieldLabel>
                <Select
                  value={config.nvenc_rate_control}
                  onValueChange={(value) => onUpdate("nvenc_rate_control", value)}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vbr">VBR - Variable Bitrate (Recommended)</SelectItem>
                    <SelectItem value="cbr">CBR - Constant Bitrate</SelectItem>
                    <SelectItem value="constqp">ConstQP - Constant Quantization</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {/* Max Bitrate */}
              <Field>
                <FieldLabel>Max Bitrate</FieldLabel>
                <Input
                  value={config.nvenc_max_bitrate}
                  onChange={(e) => onUpdate("nvenc_max_bitrate", e.target.value.toUpperCase())}
                  placeholder="8M"
                  disabled={disabled}
                />
                <FieldDescription>
                  Maximum bitrate cap (e.g., 8M, 12M, 15M)
                </FieldDescription>
              </Field>

              {/* Buffer Size */}
              <Field>
                <FieldLabel>Buffer Size</FieldLabel>
                <Input
                  value={config.nvenc_buffer_size}
                  onChange={(e) => onUpdate("nvenc_buffer_size", e.target.value.toUpperCase())}
                  placeholder="16M"
                  disabled={disabled}
                />
                <FieldDescription>
                  Buffer size for bitrate smoothing (typically 2x max bitrate)
                </FieldDescription>
              </Field>
            </div>
          )}
        </div>

        {/* CPU Fallback Section */}
        <div className="space-y-4 pt-4 border-t">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Cpu className="w-4 h-4" />
            CPU Fallback Settings
          </h4>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Used when GPU transcoding is disabled or unavailable. CPU transcoding
              is slower but works on any system.
            </p>
          </div>

          {/* Show warning about recommended settings */}
          {isCustomMode && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p className="text-sm">
                <strong>Recommended:</strong> medium preset with CRF 18 provides a good
                balance of quality and encoding speed.
              </p>
            </div>
          )}

          {isCustomMode && (
            <div className="space-y-4 pl-4 border-l-2 border-muted">
              {/* CPU Preset */}
              <Field>
                <FieldLabel>CPU Preset</FieldLabel>
                <Select
                  value={config.cpu_preset}
                  onValueChange={(value) => onUpdate("cpu_preset", value)}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CPU_PRESET_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Slower presets produce better quality at the cost of encoding time
                </FieldDescription>
              </Field>

              {/* CPU Quality (CRF) */}
              <Field>
                <div className="flex items-center justify-between">
                  <FieldLabel>Quality (CRF)</FieldLabel>
                  <span className="text-sm text-muted-foreground">
                    {config.cpu_crf} - {getQualityLabel(config.cpu_crf)}
                  </span>
                </div>
                <Slider
                  value={[config.cpu_crf]}
                  onValueChange={([value]) => onUpdate("cpu_crf", value)}
                  min={0}
                  max={51}
                  step={1}
                  disabled={disabled}
                />
                <FieldDescription>
                  Lower values = better quality, larger files (18 recommended)
                </FieldDescription>
              </Field>
            </div>
          )}

          {/* Show current CPU settings in non-custom mode */}
          {!isCustomMode && (
            <div className="text-sm text-muted-foreground pl-4">
              <p>Preset: {CPU_PRESET_LABELS[config.cpu_preset] || config.cpu_preset}</p>
              <p>Quality: CRF {config.cpu_crf} ({getQualityLabel(config.cpu_crf)})</p>
            </div>
          )}
        </div>

        {/* Output Settings Section */}
        <div className="space-y-4 pt-4 border-t">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Monitor className="w-4 h-4" />
            Output Settings
          </h4>

          {/* Max Resolution */}
          <Field>
            <FieldLabel>Max Resolution</FieldLabel>
            <Select
              value={config.max_resolution}
              onValueChange={(value) => onUpdate("max_resolution", value)}
              disabled={disabled || !isCustomMode}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RESOLUTION_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              Videos larger than this will be downscaled. Smaller videos are not upscaled.
            </FieldDescription>
          </Field>

          {/* Audio Bitrate */}
          <Field>
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-muted-foreground" />
              <FieldLabel>Audio Bitrate</FieldLabel>
            </div>
            <Select
              value={config.audio_bitrate}
              onValueChange={(value) => onUpdate("audio_bitrate", value)}
              disabled={disabled || !isCustomMode}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUDIO_BITRATE_OPTIONS.map((bitrate) => (
                  <SelectItem key={bitrate} value={bitrate}>
                    {parseInt(bitrate)} kbps
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              Higher bitrates preserve more audio quality
            </FieldDescription>
          </Field>
        </div>

        {/* Current Settings Summary (for non-custom modes) */}
        {!isCustomMode && (
          <div className="pt-4 border-t">
            <h4 className="text-sm font-medium mb-3">Current Settings Summary</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-muted-foreground">Max Resolution:</div>
              <div>{RESOLUTION_LABELS[config.max_resolution]}</div>

              <div className="text-muted-foreground">Audio Bitrate:</div>
              <div>{parseInt(config.audio_bitrate)} kbps</div>

              {config.use_gpu_transcoding && (
                <>
                  <div className="text-muted-foreground">NVENC Preset:</div>
                  <div>{config.nvenc_preset} ({NVENC_PRESET_LABELS[config.nvenc_preset]})</div>

                  <div className="text-muted-foreground">GPU Quality:</div>
                  <div>CQ {config.nvenc_cq} ({getQualityLabel(config.nvenc_cq)})</div>

                  <div className="text-muted-foreground">Max Bitrate:</div>
                  <div>{config.nvenc_max_bitrate}</div>
                </>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

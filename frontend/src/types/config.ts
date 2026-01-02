/**
 * System configuration types
 */

export interface SystemConfig {
  // Upload & Storage Settings
  max_file_size_bytes: number
  weekly_upload_limit_bytes: number
  video_storage_path: string

  // GPU Settings
  use_gpu_transcoding: boolean
  gpu_device_id: number

  // NVENC Settings
  nvenc_preset: string
  nvenc_cq: number
  nvenc_rate_control: string
  nvenc_max_bitrate: string
  nvenc_buffer_size: string

  // CPU Fallback Settings
  cpu_preset: string
  cpu_crf: number

  // Output Settings
  max_resolution: string
  audio_bitrate: string

  // Preset Mode
  transcode_preset_mode: string

  // Video Output Format
  video_output_format: VideoOutputFormat

  // Metadata
  updated_at: string
  updated_by?: string
}

export interface ConfigUpdate {
  // Upload & Storage Settings
  max_file_size_bytes?: number
  weekly_upload_limit_bytes?: number
  video_storage_path?: string

  // GPU Settings
  use_gpu_transcoding?: boolean
  gpu_device_id?: number

  // NVENC Settings
  nvenc_preset?: string
  nvenc_cq?: number
  nvenc_rate_control?: string
  nvenc_max_bitrate?: string
  nvenc_buffer_size?: string

  // CPU Fallback Settings
  cpu_preset?: string
  cpu_crf?: number

  // Output Settings
  max_resolution?: string
  audio_bitrate?: string

  // Preset Mode
  transcode_preset_mode?: string

  // Video Output Format
  video_output_format?: VideoOutputFormat
}

export interface EncoderInfo {
  gpu_available: boolean
  gpu_name?: string
  encoders: string[]
}

// Preset mode options
export type PresetMode = "quality" | "balanced" | "performance" | "custom"

// Resolution options
export type Resolution = "720p" | "1080p" | "1440p" | "4k"

// NVENC preset options (p1 = fastest, p7 = best quality)
export type NvencPreset = "p1" | "p2" | "p3" | "p4" | "p5" | "p6" | "p7"

// Rate control options
export type RateControl = "vbr" | "cbr" | "constqp"

// CPU preset options
export type CpuPreset =
  | "ultrafast"
  | "superfast"
  | "veryfast"
  | "faster"
  | "fast"
  | "medium"
  | "slow"
  | "slower"
  | "veryslow"

// Video output format options
export type VideoOutputFormat = "hls" | "progressive"

// Preset values for quick selection
export const TRANSCODING_PRESETS: Record<
  Exclude<PresetMode, "custom">,
  Partial<ConfigUpdate>
> = {
  quality: {
    nvenc_preset: "p6",
    nvenc_cq: 16,
    nvenc_max_bitrate: "15M",
    nvenc_buffer_size: "30M",
    cpu_preset: "slow",
    cpu_crf: 16,
    max_resolution: "4k",
    audio_bitrate: "256k",
  },
  balanced: {
    nvenc_preset: "p4",
    nvenc_cq: 18,
    nvenc_max_bitrate: "8M",
    nvenc_buffer_size: "16M",
    cpu_preset: "medium",
    cpu_crf: 18,
    max_resolution: "1080p",
    audio_bitrate: "192k",
  },
  performance: {
    nvenc_preset: "p2",
    nvenc_cq: 23,
    nvenc_max_bitrate: "5M",
    nvenc_buffer_size: "10M",
    cpu_preset: "fast",
    cpu_crf: 23,
    max_resolution: "1080p",
    audio_bitrate: "128k",
  },
}

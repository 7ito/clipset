package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/clipset/clipset-go/internal/api/middleware"
	"github.com/clipset/clipset-go/internal/api/response"
	"github.com/clipset/clipset-go/internal/config"
	"github.com/clipset/clipset-go/internal/db"
	"github.com/clipset/clipset-go/internal/db/sqlc"
)

// Validation constants
const (
	minFileSizeBytes     = 1048576      // 1MB
	maxFileSizeBytes     = 10737418240  // 10GB
	minWeeklyUploadBytes = 1048576      // 1MB
	maxWeeklyUploadBytes = 107374182400 // 100GB
	minGPUDeviceID       = 0
	maxGPUDeviceID       = 15
	minCQ                = 0
	maxCQ                = 51
	minCRF               = 0
	maxCRF               = 51
	ffmpegEncoderTimeout = 10 * time.Second
	nvidiaSmiTimeout     = 5 * time.Second
)

// Valid option sets
var (
	validNvencPresets      = map[string]bool{"p1": true, "p2": true, "p3": true, "p4": true, "p5": true, "p6": true, "p7": true}
	validNvencRateControls = map[string]bool{"vbr": true, "cbr": true, "constqp": true}
	validCPUPresets        = map[string]bool{
		"ultrafast": true, "superfast": true, "veryfast": true, "faster": true,
		"fast": true, "medium": true, "slow": true, "slower": true, "veryslow": true,
	}
	validResolutions   = map[string]bool{"720p": true, "1080p": true, "1440p": true, "4k": true}
	validPresetModes   = map[string]bool{"quality": true, "balanced": true, "performance": true, "custom": true}
	validOutputFormats = map[string]bool{"hls": true, "progressive": true}
	bitrateRegex       = regexp.MustCompile(`^\d+[kKmMgG]?$`)
	audioBitrateRegex  = regexp.MustCompile(`^\d+[kK]$`)
	targetEncoders     = []string{"h264_nvenc", "hevc_nvenc", "av1_nvenc", "libx264", "libx265"}
)

// Transcoding presets
var transcodingPresets = map[string]map[string]interface{}{
	"quality": {
		"nvenc_preset":      "p6",
		"nvenc_cq":          int32(16),
		"nvenc_max_bitrate": "15M",
		"nvenc_buffer_size": "30M",
		"cpu_preset":        "slow",
		"cpu_crf":           int32(16),
		"max_resolution":    "4k",
		"audio_bitrate":     "256k",
	},
	"balanced": {
		"nvenc_preset":      "p4",
		"nvenc_cq":          int32(18),
		"nvenc_max_bitrate": "8M",
		"nvenc_buffer_size": "16M",
		"cpu_preset":        "medium",
		"cpu_crf":           int32(18),
		"max_resolution":    "1080p",
		"audio_bitrate":     "192k",
	},
	"performance": {
		"nvenc_preset":      "p2",
		"nvenc_cq":          int32(23),
		"nvenc_max_bitrate": "5M",
		"nvenc_buffer_size": "10M",
		"cpu_preset":        "fast",
		"cpu_crf":           int32(23),
		"max_resolution":    "1080p",
		"audio_bitrate":     "128k",
	},
}

// HLS Migration state (global in-memory state)
type hlsMigrationState struct {
	mu           sync.RWMutex
	IsRunning    bool
	Total        int
	Completed    int
	CurrentVideo string
	Errors       []string
}

var migrationState = &hlsMigrationState{}

// ConfigHandler handles admin configuration endpoints
type ConfigHandler struct {
	db     *db.DB
	config *config.Config
}

// NewConfigHandler creates a new config handler
func NewConfigHandler(database *db.DB, cfg *config.Config) *ConfigHandler {
	return &ConfigHandler{
		db:     database,
		config: cfg,
	}
}

// --- Response Types ---

// ConfigResponse represents the system configuration
type ConfigResponse struct {
	MaxFileSizeBytes       int64     `json:"max_file_size_bytes"`
	WeeklyUploadLimitBytes int64     `json:"weekly_upload_limit_bytes"`
	UseGPUTranscoding      bool      `json:"use_gpu_transcoding"`
	GPUDeviceID            int32     `json:"gpu_device_id"`
	NvencPreset            string    `json:"nvenc_preset"`
	NvencCQ                int32     `json:"nvenc_cq"`
	NvencRateControl       string    `json:"nvenc_rate_control"`
	NvencMaxBitrate        string    `json:"nvenc_max_bitrate"`
	NvencBufferSize        string    `json:"nvenc_buffer_size"`
	CPUPreset              string    `json:"cpu_preset"`
	CPUCRF                 int32     `json:"cpu_crf"`
	MaxResolution          string    `json:"max_resolution"`
	AudioBitrate           string    `json:"audio_bitrate"`
	TranscodePresetMode    string    `json:"transcode_preset_mode"`
	VideoOutputFormat      string    `json:"video_output_format"`
	UpdatedAt              time.Time `json:"updated_at"`
	UpdatedBy              *string   `json:"updated_by"`
}

// EncoderInfoResponse represents encoder detection results
type EncoderInfoResponse struct {
	GPUAvailable bool     `json:"gpu_available"`
	GPUName      *string  `json:"gpu_name"`
	Encoders     []string `json:"encoders"`
}

// HLSMigrationStatusResponse represents HLS migration status
type HLSMigrationStatusResponse struct {
	IsRunning    bool     `json:"is_running"`
	Total        int      `json:"total"`
	Completed    int      `json:"completed"`
	CurrentVideo *string  `json:"current_video"`
	Errors       []string `json:"errors"`
}

// --- Request Types ---

// ConfigUpdateRequest represents the config update request (all fields optional)
type ConfigUpdateRequest struct {
	MaxFileSizeBytes       *int64  `json:"max_file_size_bytes"`
	WeeklyUploadLimitBytes *int64  `json:"weekly_upload_limit_bytes"`
	UseGPUTranscoding      *bool   `json:"use_gpu_transcoding"`
	GPUDeviceID            *int32  `json:"gpu_device_id"`
	NvencPreset            *string `json:"nvenc_preset"`
	NvencCQ                *int32  `json:"nvenc_cq"`
	NvencRateControl       *string `json:"nvenc_rate_control"`
	NvencMaxBitrate        *string `json:"nvenc_max_bitrate"`
	NvencBufferSize        *string `json:"nvenc_buffer_size"`
	CPUPreset              *string `json:"cpu_preset"`
	CPUCRF                 *int32  `json:"cpu_crf"`
	MaxResolution          *string `json:"max_resolution"`
	AudioBitrate           *string `json:"audio_bitrate"`
	TranscodePresetMode    *string `json:"transcode_preset_mode"`
	VideoOutputFormat      *string `json:"video_output_format"`
}

// --- Helper Functions ---

// buildConfigResponse converts a database config to a response
func buildConfigResponse(cfg sqlc.Config) ConfigResponse {
	var updatedBy *string
	if cfg.UpdatedBy.Valid {
		s := uuid.UUID(cfg.UpdatedBy.Bytes).String()
		updatedBy = &s
	}

	return ConfigResponse{
		MaxFileSizeBytes:       cfg.MaxFileSizeBytes,
		WeeklyUploadLimitBytes: cfg.WeeklyUploadLimitBytes,
		UseGPUTranscoding:      cfg.UseGpuTranscoding,
		GPUDeviceID:            cfg.GpuDeviceID,
		NvencPreset:            cfg.NvencPreset,
		NvencCQ:                cfg.NvencCq,
		NvencRateControl:       cfg.NvencRateControl,
		NvencMaxBitrate:        cfg.NvencMaxBitrate,
		NvencBufferSize:        cfg.NvencBufferSize,
		CPUPreset:              cfg.CpuPreset,
		CPUCRF:                 cfg.CpuCrf,
		MaxResolution:          cfg.MaxResolution,
		AudioBitrate:           cfg.AudioBitrate,
		TranscodePresetMode:    cfg.TranscodePresetMode,
		VideoOutputFormat:      cfg.VideoOutputFormat,
		UpdatedAt:              cfg.UpdatedAt,
		UpdatedBy:              updatedBy,
	}
}

// detectEncoders runs ffmpeg to detect available encoders
func detectEncoders(ctx context.Context) ([]string, bool, error) {
	ctx, cancel := context.WithTimeout(ctx, ffmpegEncoderTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "ffmpeg", "-encoders", "-hide_banner")
	output, err := cmd.Output()
	if err != nil {
		return nil, false, err
	}

	var encoders []string
	gpuAvailable := false

	scanner := bufio.NewScanner(strings.NewReader(string(output)))
	for scanner.Scan() {
		line := scanner.Text()
		for _, encoder := range targetEncoders {
			if strings.Contains(line, encoder) {
				encoders = append(encoders, encoder)
				if strings.HasSuffix(encoder, "_nvenc") {
					gpuAvailable = true
				}
				break
			}
		}
	}

	return encoders, gpuAvailable, nil
}

// detectGPUName runs nvidia-smi to get GPU name
func detectGPUName(ctx context.Context) *string {
	ctx, cancel := context.WithTimeout(ctx, nvidiaSmiTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "nvidia-smi", "--query-gpu=name", "--format=csv,noheader")
	output, err := cmd.Output()
	if err != nil {
		return nil
	}

	// Get first line (first GPU)
	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	if len(lines) > 0 && lines[0] != "" {
		name := strings.TrimSpace(lines[0])
		return &name
	}

	return nil
}

// hasAnyField checks if the request has any non-nil fields
func (r *ConfigUpdateRequest) hasAnyField() bool {
	return r.MaxFileSizeBytes != nil ||
		r.WeeklyUploadLimitBytes != nil ||
		r.UseGPUTranscoding != nil ||
		r.GPUDeviceID != nil ||
		r.NvencPreset != nil ||
		r.NvencCQ != nil ||
		r.NvencRateControl != nil ||
		r.NvencMaxBitrate != nil ||
		r.NvencBufferSize != nil ||
		r.CPUPreset != nil ||
		r.CPUCRF != nil ||
		r.MaxResolution != nil ||
		r.AudioBitrate != nil ||
		r.TranscodePresetMode != nil ||
		r.VideoOutputFormat != nil
}

// --- Handlers ---

// Get handles GET /api/config/
func (h *ConfigHandler) Get(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Verify user is authenticated (admin check done by middleware)
	_, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	// Get config
	cfg, err := h.db.Queries.GetConfig(ctx)
	if err != nil {
		log.Printf("Error getting config: %v", err)
		response.InternalServerError(w, "Failed to fetch system configuration")
		return
	}

	response.OK(w, buildConfigResponse(cfg))
}

// Update handles PATCH /api/config/
func (h *ConfigHandler) Update(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Get current user (admin check done by middleware)
	userID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	// Parse request body
	var req ConfigUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "Invalid request body")
		return
	}

	// Check if any fields provided
	if !req.hasAnyField() {
		response.BadRequest(w, "No fields provided for update")
		return
	}

	// Get current config for defaults
	currentConfig, err := h.db.Queries.GetConfig(ctx)
	if err != nil {
		log.Printf("Error getting current config: %v", err)
		response.InternalServerError(w, "Failed to get current configuration")
		return
	}

	// Validate and normalize fields
	// max_file_size_bytes
	if req.MaxFileSizeBytes != nil {
		if *req.MaxFileSizeBytes < minFileSizeBytes || *req.MaxFileSizeBytes > maxFileSizeBytes {
			response.BadRequest(w, "max_file_size_bytes must be between 1MB and 10GB")
			return
		}
	}

	// weekly_upload_limit_bytes
	if req.WeeklyUploadLimitBytes != nil {
		if *req.WeeklyUploadLimitBytes < minWeeklyUploadBytes || *req.WeeklyUploadLimitBytes > maxWeeklyUploadBytes {
			response.BadRequest(w, "weekly_upload_limit_bytes must be between 1MB and 100GB")
			return
		}
	}

	// gpu_device_id
	if req.GPUDeviceID != nil {
		if *req.GPUDeviceID < minGPUDeviceID || *req.GPUDeviceID > maxGPUDeviceID {
			response.BadRequest(w, "gpu_device_id must be between 0 and 15")
			return
		}
	}

	// nvenc_preset
	if req.NvencPreset != nil {
		if !validNvencPresets[*req.NvencPreset] {
			response.BadRequest(w, "nvenc_preset must be one of: p1, p2, p3, p4, p5, p6, p7")
			return
		}
	}

	// nvenc_cq
	if req.NvencCQ != nil {
		if *req.NvencCQ < minCQ || *req.NvencCQ > maxCQ {
			response.BadRequest(w, "nvenc_cq must be between 0 and 51")
			return
		}
	}

	// nvenc_rate_control
	if req.NvencRateControl != nil {
		if !validNvencRateControls[*req.NvencRateControl] {
			response.BadRequest(w, "nvenc_rate_control must be one of: vbr, cbr, constqp")
			return
		}
	}

	// nvenc_max_bitrate
	if req.NvencMaxBitrate != nil {
		normalized := strings.ToUpper(*req.NvencMaxBitrate)
		if !bitrateRegex.MatchString(normalized) {
			response.BadRequest(w, "nvenc_max_bitrate must match pattern like 8M, 5000k")
			return
		}
		req.NvencMaxBitrate = &normalized
	}

	// nvenc_buffer_size
	if req.NvencBufferSize != nil {
		normalized := strings.ToUpper(*req.NvencBufferSize)
		if !bitrateRegex.MatchString(normalized) {
			response.BadRequest(w, "nvenc_buffer_size must match pattern like 16M, 10000k")
			return
		}
		req.NvencBufferSize = &normalized
	}

	// cpu_preset
	if req.CPUPreset != nil {
		if !validCPUPresets[*req.CPUPreset] {
			response.BadRequest(w, "cpu_preset must be one of: ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow")
			return
		}
	}

	// cpu_crf
	if req.CPUCRF != nil {
		if *req.CPUCRF < minCRF || *req.CPUCRF > maxCRF {
			response.BadRequest(w, "cpu_crf must be between 0 and 51")
			return
		}
	}

	// max_resolution
	if req.MaxResolution != nil {
		if !validResolutions[*req.MaxResolution] {
			response.BadRequest(w, "max_resolution must be one of: 720p, 1080p, 1440p, 4k")
			return
		}
	}

	// audio_bitrate
	if req.AudioBitrate != nil {
		normalized := strings.ToLower(*req.AudioBitrate)
		if !audioBitrateRegex.MatchString(normalized) {
			response.BadRequest(w, "audio_bitrate must match pattern like 192k, 256k")
			return
		}
		req.AudioBitrate = &normalized
	}

	// transcode_preset_mode
	if req.TranscodePresetMode != nil {
		if !validPresetModes[*req.TranscodePresetMode] {
			response.BadRequest(w, "transcode_preset_mode must be one of: quality, balanced, performance, custom")
			return
		}
	}

	// video_output_format
	if req.VideoOutputFormat != nil {
		if !validOutputFormats[*req.VideoOutputFormat] {
			response.BadRequest(w, "video_output_format must be one of: hls, progressive")
			return
		}
	}

	// Apply preset values if transcode_preset_mode is changed to a non-custom value
	if req.TranscodePresetMode != nil && *req.TranscodePresetMode != "custom" {
		preset, exists := transcodingPresets[*req.TranscodePresetMode]
		if exists {
			// Apply preset values only if not explicitly set in request
			if req.NvencPreset == nil {
				v := preset["nvenc_preset"].(string)
				req.NvencPreset = &v
			}
			if req.NvencCQ == nil {
				v := preset["nvenc_cq"].(int32)
				req.NvencCQ = &v
			}
			if req.NvencMaxBitrate == nil {
				v := preset["nvenc_max_bitrate"].(string)
				req.NvencMaxBitrate = &v
			}
			if req.NvencBufferSize == nil {
				v := preset["nvenc_buffer_size"].(string)
				req.NvencBufferSize = &v
			}
			if req.CPUPreset == nil {
				v := preset["cpu_preset"].(string)
				req.CPUPreset = &v
			}
			if req.CPUCRF == nil {
				v := preset["cpu_crf"].(int32)
				req.CPUCRF = &v
			}
			if req.MaxResolution == nil {
				v := preset["max_resolution"].(string)
				req.MaxResolution = &v
			}
			if req.AudioBitrate == nil {
				v := preset["audio_bitrate"].(string)
				req.AudioBitrate = &v
			}
		}
	}

	// Build update params with defaults from current config
	// For nullable int64/int32/bool, we need to use 0/false to keep existing if nil
	// The SQL uses COALESCE, so we pass the value or use the default behavior

	params := sqlc.UpdateConfigParams{
		UpdatedBy: pgtype.UUID{Bytes: userID, Valid: true},
	}

	// Integer fields: pass 0 to keep existing (COALESCE with null won't work, we need special handling)
	// Actually, looking at the SQL, COALESCE($1, existing) means if we pass nil/null, it keeps existing
	// But sqlc generates non-pointer types, so we need to pass actual values

	// For int64/int32/bool - pass the new value or current value
	if req.MaxFileSizeBytes != nil {
		params.MaxFileSizeBytes = *req.MaxFileSizeBytes
	} else {
		params.MaxFileSizeBytes = currentConfig.MaxFileSizeBytes
	}

	if req.WeeklyUploadLimitBytes != nil {
		params.WeeklyUploadLimitBytes = *req.WeeklyUploadLimitBytes
	} else {
		params.WeeklyUploadLimitBytes = currentConfig.WeeklyUploadLimitBytes
	}

	if req.UseGPUTranscoding != nil {
		params.UseGpuTranscoding = *req.UseGPUTranscoding
	} else {
		params.UseGpuTranscoding = currentConfig.UseGpuTranscoding
	}

	if req.GPUDeviceID != nil {
		params.GpuDeviceID = *req.GPUDeviceID
	} else {
		params.GpuDeviceID = currentConfig.GpuDeviceID
	}

	if req.NvencCQ != nil {
		params.NvencCq = *req.NvencCQ
	} else {
		params.NvencCq = currentConfig.NvencCq
	}

	if req.CPUCRF != nil {
		params.CpuCrf = *req.CPUCRF
	} else {
		params.CpuCrf = currentConfig.CpuCrf
	}

	// String fields: pass empty string to keep existing (SQL uses NULLIF to convert empty to NULL)
	params.Column3 = ""

	if req.NvencPreset != nil {
		params.Column6 = *req.NvencPreset
	} else {
		params.Column6 = ""
	}

	if req.NvencRateControl != nil {
		params.Column8 = *req.NvencRateControl
	} else {
		params.Column8 = ""
	}

	if req.NvencMaxBitrate != nil {
		params.Column9 = *req.NvencMaxBitrate
	} else {
		params.Column9 = ""
	}

	if req.NvencBufferSize != nil {
		params.Column10 = *req.NvencBufferSize
	} else {
		params.Column10 = ""
	}

	if req.CPUPreset != nil {
		params.Column11 = *req.CPUPreset
	} else {
		params.Column11 = ""
	}

	if req.MaxResolution != nil {
		params.Column13 = *req.MaxResolution
	} else {
		params.Column13 = ""
	}

	if req.AudioBitrate != nil {
		params.Column14 = *req.AudioBitrate
	} else {
		params.Column14 = ""
	}

	if req.TranscodePresetMode != nil {
		params.Column15 = *req.TranscodePresetMode
	} else {
		params.Column15 = ""
	}

	if req.VideoOutputFormat != nil {
		params.Column16 = *req.VideoOutputFormat
	} else {
		params.Column16 = ""
	}

	// Update config
	updatedConfig, err := h.db.Queries.UpdateConfig(ctx, params)
	if err != nil {
		log.Printf("Error updating config: %v", err)
		response.InternalServerError(w, "Failed to update system configuration")
		return
	}

	log.Printf("Updated system configuration by user %s", userID)

	response.OK(w, buildConfigResponse(updatedConfig))
}

// GetEncoders handles GET /api/config/encoders
func (h *ConfigHandler) GetEncoders(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Verify user is authenticated (admin check done by middleware)
	_, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	// Detect encoders
	encoders, gpuAvailable, err := detectEncoders(ctx)
	if err != nil {
		log.Printf("Error detecting encoders: %v", err)
		response.InternalServerError(w, "Failed to detect available encoders")
		return
	}

	// Get GPU name if GPU is available
	var gpuName *string
	if gpuAvailable {
		gpuName = detectGPUName(ctx)
	}

	response.OK(w, EncoderInfoResponse{
		GPUAvailable: gpuAvailable,
		GPUName:      gpuName,
		Encoders:     encoders,
	})
}

// GetHLSMigrationStatus handles GET /api/config/hls-migration-status
func (h *ConfigHandler) GetHLSMigrationStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Verify user is authenticated (admin check done by middleware)
	_, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	// Get migration status from global state
	migrationState.mu.RLock()
	defer migrationState.mu.RUnlock()

	var currentVideo *string
	if migrationState.CurrentVideo != "" {
		currentVideo = &migrationState.CurrentVideo
	}

	errors := migrationState.Errors
	if errors == nil {
		errors = []string{}
	}

	response.OK(w, HLSMigrationStatusResponse{
		IsRunning:    migrationState.IsRunning,
		Total:        migrationState.Total,
		Completed:    migrationState.Completed,
		CurrentVideo: currentVideo,
		Errors:       errors,
	})
}

// --- Migration State Management (exported for use by worker package) ---

// SetMigrationRunning sets the migration running state
func SetMigrationRunning(running bool) {
	migrationState.mu.Lock()
	defer migrationState.mu.Unlock()
	migrationState.IsRunning = running
}

// SetMigrationTotal sets the total videos to migrate
func SetMigrationTotal(total int) {
	migrationState.mu.Lock()
	defer migrationState.mu.Unlock()
	migrationState.Total = total
}

// IncrementMigrationCompleted increments the completed count
func IncrementMigrationCompleted() {
	migrationState.mu.Lock()
	defer migrationState.mu.Unlock()
	migrationState.Completed++
}

// SetMigrationCurrentVideo sets the current video being processed
func SetMigrationCurrentVideo(video string) {
	migrationState.mu.Lock()
	defer migrationState.mu.Unlock()
	migrationState.CurrentVideo = video
}

// AddMigrationError adds an error to the error list
func AddMigrationError(err string) {
	migrationState.mu.Lock()
	defer migrationState.mu.Unlock()
	migrationState.Errors = append(migrationState.Errors, err)
}

// ResetMigrationState resets the migration state
func ResetMigrationState() {
	migrationState.mu.Lock()
	defer migrationState.mu.Unlock()
	migrationState.IsRunning = false
	migrationState.Total = 0
	migrationState.Completed = 0
	migrationState.CurrentVideo = ""
	migrationState.Errors = nil
}

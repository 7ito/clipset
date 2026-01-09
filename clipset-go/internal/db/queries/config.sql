-- name: GetConfig :one
SELECT * FROM config WHERE id = 1;

-- name: UpdateConfig :one
UPDATE config SET
    max_file_size_bytes = COALESCE($1, max_file_size_bytes),
    weekly_upload_limit_bytes = COALESCE($2, weekly_upload_limit_bytes),
    video_storage_path = COALESCE(NULLIF($3, ''), video_storage_path),
    use_gpu_transcoding = COALESCE($4, use_gpu_transcoding),
    gpu_device_id = COALESCE($5, gpu_device_id),
    nvenc_preset = COALESCE(NULLIF($6, ''), nvenc_preset),
    nvenc_cq = COALESCE($7, nvenc_cq),
    nvenc_rate_control = COALESCE(NULLIF($8, ''), nvenc_rate_control),
    nvenc_max_bitrate = COALESCE(NULLIF($9, ''), nvenc_max_bitrate),
    nvenc_buffer_size = COALESCE(NULLIF($10, ''), nvenc_buffer_size),
    cpu_preset = COALESCE(NULLIF($11, ''), cpu_preset),
    cpu_crf = COALESCE($12, cpu_crf),
    max_resolution = COALESCE(NULLIF($13, ''), max_resolution),
    audio_bitrate = COALESCE(NULLIF($14, ''), audio_bitrate),
    transcode_preset_mode = COALESCE(NULLIF($15, ''), transcode_preset_mode),
    video_output_format = COALESCE(NULLIF($16, ''), video_output_format),
    updated_at = NOW(),
    updated_by = $17
WHERE id = 1
RETURNING *;

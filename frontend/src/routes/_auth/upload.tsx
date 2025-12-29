import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState, useRef, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Upload, Loader2, AlertTriangle } from "lucide-react"
import { uploadVideo, getQuotaInfo } from "@/api/videos"
import { getCategories } from "@/api/categories"
import { createPlaylist, addVideoToPlaylist } from "@/api/playlists"
import { useAuth } from "@/hooks/useAuth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"
import { formatFileSize } from "@/lib/formatters"
import {
  BatchFileQueue,
  BatchUploadProgress,
  PlaylistSelector,
  type QueuedFile,
  type PlaylistOption
} from "@/components/upload"

export const Route = createFileRoute("/_auth/upload")({
  component: UploadPage
})

const ACCEPTED_FORMATS = ["mp4", "mov", "avi", "mkv", "webm", "hevc", "h265"]
const MAX_BATCH_SIZE = 20

function UploadPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // File queue state
  const [fileQueue, setFileQueue] = useState<QueuedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessingFiles, setIsProcessingFiles] = useState(false)

  // Shared metadata state
  const [titlePrefix, setTitlePrefix] = useState("")
  const [categoryId, setCategoryId] = useState<string>("")

  // Playlist state
  const [playlistOption, setPlaylistOption] = useState<PlaylistOption>("none")
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("")
  const [newPlaylistName, setNewPlaylistName] = useState("")
  const [newPlaylistDescription, setNewPlaylistDescription] = useState("")

  // Upload state
  const [uploadMode, setUploadMode] = useState<"idle" | "uploading" | "complete">("idle")
  const [currentUploadIndex, setCurrentUploadIndex] = useState(0)
  const [createdPlaylistId, setCreatedPlaylistId] = useState<string | null>(null)
  const [createdPlaylistName, setCreatedPlaylistName] = useState<string | null>(null)

  // Fetch quota info
  const { data: quota, refetch: refetchQuota } = useQuery({
    queryKey: ["quota", "me"],
    queryFn: getQuotaInfo
  })

  // Fetch categories
  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories
  })

  // Generate video thumbnail from file
  const generateVideoThumbnail = useCallback((file: File): Promise<string | null> => {
    return new Promise((resolve) => {
      const video = document.createElement("video")
      const canvas = document.createElement("canvas")
      const url = URL.createObjectURL(file)

      video.preload = "metadata"
      video.src = url
      video.muted = true
      video.playsInline = true

      const cleanup = () => {
        URL.revokeObjectURL(url)
      }

      video.onloadedmetadata = () => {
        video.currentTime = Math.min(1, video.duration * 0.1)
      }

      video.onseeked = () => {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext("2d")
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7)
        cleanup()
        resolve(dataUrl)
      }

      video.onerror = () => {
        cleanup()
        resolve(null)
      }

      setTimeout(() => {
        cleanup()
        resolve(null)
      }, 5000)
    })
  }, [])

  // Generate unique ID for each file
  const generateId = () => Math.random().toString(36).substring(2, 15)

  // Process and validate selected files
  const processFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    const limit = quota?.max_file_size_bytes || 2 * 1024 * 1024 * 1024

    // Filter and validate files
    const validFiles: File[] = []
    const errors: string[] = []

    for (const file of fileArray) {
      const ext = file.name.split(".").pop()?.toLowerCase()
      
      if (!ext || !ACCEPTED_FORMATS.includes(ext)) {
        errors.push(`${file.name}: Invalid format`)
        continue
      }

      if (file.size > limit) {
        errors.push(`${file.name}: Too large (max ${formatFileSize(limit)})`)
        continue
      }

      validFiles.push(file)
    }

    // Check batch size limit
    const totalFiles = fileQueue.length + validFiles.length
    if (totalFiles > MAX_BATCH_SIZE) {
      const allowedCount = MAX_BATCH_SIZE - fileQueue.length
      if (allowedCount > 0) {
        toast.warning(`Only adding first ${allowedCount} files. Maximum batch size is ${MAX_BATCH_SIZE}.`)
        validFiles.splice(allowedCount)
      } else {
        toast.error(`Maximum batch size of ${MAX_BATCH_SIZE} files reached.`)
        return
      }
    }

    if (errors.length > 0) {
      toast.error(`${errors.length} file(s) skipped:\n${errors.slice(0, 3).join("\n")}${errors.length > 3 ? `\n...and ${errors.length - 3} more` : ""}`)
    }

    if (validFiles.length === 0) return

    setIsProcessingFiles(true)

    // Create queued file objects with preview generation
    const newQueuedFiles: QueuedFile[] = await Promise.all(
      validFiles.map(async (file) => {
        const id = generateId()
        const title = file.name.replace(/\.[^/.]+$/, "")
        
        // Create initial queued file with loading state
        const queuedFile: QueuedFile = {
          id,
          file,
          title,
          description: "",
          previewUrl: null,
          isGeneratingPreview: true,
          status: "pending",
          progress: 0
        }

        // Generate preview asynchronously
        const previewUrl = await generateVideoThumbnail(file)
        
        return {
          ...queuedFile,
          previewUrl,
          isGeneratingPreview: false
        }
      })
    )

    setFileQueue((prev) => [...prev, ...newQueuedFiles])
    setIsProcessingFiles(false)

    // Auto-set title prefix if this is the first batch and no prefix set
    if (fileQueue.length === 0 && !titlePrefix && validFiles.length > 1) {
      // Try to find common prefix in filenames
      const filenames = validFiles.map((f) => f.name.replace(/\.[^/.]+$/, ""))
      const commonPrefix = findCommonPrefix(filenames)
      if (commonPrefix.length >= 3) {
        setTitlePrefix(commonPrefix.trim())
      }
    }
  }, [fileQueue.length, titlePrefix, quota?.max_file_size_bytes, generateVideoThumbnail])

  // Find common prefix among strings (for auto-suggesting title prefix)
  const findCommonPrefix = (strings: string[]): string => {
    if (strings.length === 0) return ""
    if (strings.length === 1) return ""
    
    const sorted = [...strings].sort()
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    
    let i = 0
    while (i < first.length && first[i] === last[i]) i++
    
    return first.substring(0, i)
  }

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      processFiles(files)
    }
    // Reset input to allow selecting same files again
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  // Handle drag events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      processFiles(files)
    }
  }

  // Clear all files
  const handleClearAll = () => {
    // Revoke all preview URLs
    fileQueue.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl)
    })
    setFileQueue([])
    setTitlePrefix("")
    setCategoryId("")
    setPlaylistOption("none")
    setSelectedPlaylistId("")
    setNewPlaylistName("")
    setNewPlaylistDescription("")
  }

  // Update file status helper
  const updateFileStatus = useCallback((
    id: string,
    status: QueuedFile["status"],
    progress?: number,
    videoId?: string,
    error?: string
  ) => {
    setFileQueue((prev) =>
      prev.map((f) =>
        f.id === id
          ? {
              ...f,
              status,
              progress: progress ?? f.progress,
              videoId: videoId ?? f.videoId,
              error: error ?? f.error
            }
          : f
      )
    )
  }, [])

  // Handle batch upload
  const handleBatchUpload = async () => {
    if (fileQueue.length === 0) {
      toast.error("Please select at least one file")
      return
    }

    // Validate titles
    const missingTitles = fileQueue.some((f, i) => {
      const title = titlePrefix ? `${titlePrefix} ${i + 1}` : f.title
      return !title.trim()
    })

    if (missingTitles) {
      toast.error("All videos must have a title")
      return
    }

    // Validate playlist if creating new
    if (playlistOption === "new" && !newPlaylistName.trim()) {
      toast.error("Please enter a playlist name")
      return
    }

    // Validate playlist if selecting existing
    if (playlistOption === "existing" && !selectedPlaylistId) {
      toast.error("Please select a playlist")
      return
    }

    setUploadMode("uploading")
    setCurrentUploadIndex(0)

    let playlistId: string | null = null
    let playlistName: string | null = null

    // Create playlist first if needed
    if (playlistOption === "new" && newPlaylistName.trim()) {
      try {
        const newPlaylist = await createPlaylist({
          name: newPlaylistName.trim(),
          description: newPlaylistDescription.trim() || undefined
        })
        playlistId = newPlaylist.id
        playlistName = newPlaylist.name
        setCreatedPlaylistId(newPlaylist.id)
        setCreatedPlaylistName(newPlaylist.name)
      } catch (error: any) {
        toast.error(error.response?.data?.detail || "Failed to create playlist")
        setUploadMode("idle")
        return
      }
    } else if (playlistOption === "existing" && selectedPlaylistId) {
      playlistId = selectedPlaylistId
      // Get playlist name from the list
      const playlists = queryClient.getQueryData<{ playlists: Array<{ id: string; name: string }> }>(
        ["playlists", "by-user", user?.username]
      )
      playlistName = playlists?.playlists.find((p) => p.id === selectedPlaylistId)?.name || null
      setCreatedPlaylistId(playlistId)
      setCreatedPlaylistName(playlistName)
    }

    // Upload videos sequentially
    for (let i = 0; i < fileQueue.length; i++) {
      const queuedFile = fileQueue[i]
      setCurrentUploadIndex(i)
      updateFileStatus(queuedFile.id, "uploading", 0)

      try {
        // Generate title
        const title = titlePrefix ? `${titlePrefix} ${i + 1}` : queuedFile.title

        // Upload video
        const video = await uploadVideo(
          queuedFile.file,
          {
            title,
            description: queuedFile.description || undefined,
            category_id: categoryId || undefined
          },
          (progress) => updateFileStatus(queuedFile.id, "uploading", progress)
        )

        // Add to playlist if selected
        if (playlistId && video.id) {
          try {
            await addVideoToPlaylist(playlistId, video.id)
          } catch (playlistError) {
            console.error("Failed to add video to playlist:", playlistError)
            // Don't fail the whole upload, just note it
          }
        }

        updateFileStatus(queuedFile.id, "complete", 100, video.id)
      } catch (error: any) {
        const errorMessage = error.response?.data?.detail || error.message || "Upload failed"
        updateFileStatus(queuedFile.id, "failed", 0, undefined, errorMessage)
        // Continue with next file
      }
    }

    // Refresh data
    refetchQuota()
    queryClient.invalidateQueries({ queryKey: ["videos"] })
    queryClient.invalidateQueries({ queryKey: ["playlists"] })

    setUploadMode("complete")
  }

  // Navigation handlers for completion screen
  const handleViewPlaylist = () => {
    if (createdPlaylistId && user) {
      navigate({
        to: "/profile/$username/playlist/$id",
        params: { username: user.username, id: createdPlaylistId }
      })
    }
  }

  const handleViewProfile = () => {
    if (user) {
      navigate({ to: "/profile/$username", params: { username: user.username } })
    }
  }

  const handleUploadMore = () => {
    // Clear everything and reset
    fileQueue.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl)
    })
    setFileQueue([])
    setTitlePrefix("")
    setCategoryId("")
    setPlaylistOption("none")
    setSelectedPlaylistId("")
    setNewPlaylistName("")
    setNewPlaylistDescription("")
    setUploadMode("idle")
    setCurrentUploadIndex(0)
    setCreatedPlaylistId(null)
    setCreatedPlaylistName(null)
  }

  // Calculate total size of selected files
  const totalSize = fileQueue.reduce((acc, f) => acc + f.file.size, 0)
  const pendingCount = fileQueue.filter((f) => f.status === "pending").length

  // Check if we can upload
  const canUpload =
    fileQueue.length > 0 &&
    pendingCount === fileQueue.length &&
    uploadMode === "idle" &&
    (playlistOption !== "new" || newPlaylistName.trim()) &&
    (playlistOption !== "existing" || selectedPlaylistId)

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Upload Videos</h1>
        <p className="text-muted-foreground text-lg">
          Share your videos with the community
        </p>
      </div>

      {/* Upload Progress / Completion View */}
      {uploadMode !== "idle" && (
        <Card>
          <CardContent className="pt-6">
            <BatchUploadProgress
              files={fileQueue}
              currentIndex={currentUploadIndex}
              playlistName={createdPlaylistName || undefined}
              onViewPlaylist={createdPlaylistId ? handleViewPlaylist : undefined}
              onViewProfile={handleViewProfile}
              onUploadMore={handleUploadMore}
              isComplete={uploadMode === "complete"}
            />
          </CardContent>
        </Card>
      )}

      {/* Normal Upload UI (hidden during upload) */}
      {uploadMode === "idle" && (
        <>
          {/* Quota Display */}
          {quota && (
            <Card className={quota.percentage_used >= 90 ? "border-destructive" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Upload Quota</CardTitle>
                  <span className="text-2xl font-bold">
                    {quota.percentage_used.toFixed(0)}%
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress value={quota.percentage_used} className="h-2" />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {formatFileSize(quota.used_bytes)} used
                  </span>
                  <span className="text-muted-foreground">
                    {formatFileSize(quota.remaining_bytes)} remaining
                  </span>
                </div>
                {quota.percentage_used >= 90 && (
                  <p className="text-sm text-destructive font-medium">
                    {quota.percentage_used >= 100 ? "Quota limit reached" : "Low quota remaining"}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* File Selection Zone */}
          <Card>
            <CardContent className="pt-6">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  border-2 border-dashed rounded-xl p-8 text-center 
                  transition-all duration-200 cursor-pointer
                  ${isDragging
                    ? "border-primary bg-primary/10 scale-[1.02]"
                    : "border-muted-foreground/25 hover:border-primary/50 hover:bg-accent/50"
                  }
                `}
              >
                {isProcessingFiles ? (
                  <div className="space-y-4">
                    <div className="inline-flex p-4 rounded-full bg-muted">
                      <Loader2 className="w-10 h-10 text-primary animate-spin" />
                    </div>
                    <p className="text-muted-foreground">Processing files...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="inline-flex p-4 rounded-full bg-muted">
                      <Upload className="w-10 h-10 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold mb-2">
                        {fileQueue.length > 0
                          ? "Drop more videos or click to add"
                          : "Drop your videos here or click to browse"
                        }
                      </p>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <p>
                          Select <span className="font-medium">multiple files</span> at once
                        </p>
                        <p>
                          Formats: <span className="font-medium">{ACCEPTED_FORMATS.join(", ")}</span>
                        </p>
                        <p>
                          Max size: <span className="font-medium">{formatFileSize(quota?.max_file_size_bytes || 2 * 1024 * 1024 * 1024)}</span> per file
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  multiple
                  onChange={handleFileInputChange}
                  className="hidden"
                />
              </div>
            </CardContent>
          </Card>

          {/* File Queue */}
          {fileQueue.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <BatchFileQueue
                  files={fileQueue}
                  onFilesChange={setFileQueue}
                  onClearAll={handleClearAll}
                  titlePrefix={titlePrefix}
                />
              </CardContent>
            </Card>
          )}

          {/* Shared Settings */}
          {fileQueue.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Settings</CardTitle>
                <CardDescription>
                  These settings apply to all videos in the batch
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Title Prefix */}
                {fileQueue.length > 1 && (
                  <div className="space-y-2">
                    <Label htmlFor="title-prefix">Title Prefix (optional)</Label>
                    <Input
                      id="title-prefix"
                      value={titlePrefix}
                      onChange={(e) => setTitlePrefix(e.target.value)}
                      placeholder="e.g., Pickup Basketball Game"
                      maxLength={180}
                    />
                    {titlePrefix && (
                      <p className="text-xs text-muted-foreground">
                        Preview: "{titlePrefix} 1", "{titlePrefix} 2"...
                      </p>
                    )}
                    {!titlePrefix && (
                      <p className="text-xs text-muted-foreground">
                        Leave empty to use individual titles from the file queue
                      </p>
                    )}
                  </div>
                )}

                {/* Category */}
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select value={categoryId || "none"} onValueChange={(val) => setCategoryId(val === "none" ? "" : val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No category</SelectItem>
                      {categoriesData?.categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Playlist Selector */}
                <div className="border-t pt-6">
                  <PlaylistSelector
                    option={playlistOption}
                    onOptionChange={setPlaylistOption}
                    selectedPlaylistId={selectedPlaylistId}
                    onSelectedPlaylistChange={setSelectedPlaylistId}
                    newPlaylistName={newPlaylistName}
                    onNewPlaylistNameChange={setNewPlaylistName}
                    newPlaylistDescription={newPlaylistDescription}
                    onNewPlaylistDescriptionChange={setNewPlaylistDescription}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Upload Summary & Button */}
          {fileQueue.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {/* Summary */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {fileQueue.length} {fileQueue.length === 1 ? "video" : "videos"} • {formatFileSize(totalSize)} total
                    </span>
                    {quota && totalSize > quota.remaining_bytes && (
                      <span className="text-destructive flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4" />
                        Exceeds remaining quota
                      </span>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <Button
                      onClick={handleBatchUpload}
                      disabled={!canUpload || (quota && totalSize > quota.remaining_bytes)}
                      className="flex-1"
                      size="lg"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Upload {fileQueue.length} {fileQueue.length === 1 ? "Video" : "Videos"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleClearAll}
                      size="lg"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

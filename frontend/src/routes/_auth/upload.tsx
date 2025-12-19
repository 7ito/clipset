import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Upload, X, FileVideo } from "lucide-react"
import { uploadVideo, getQuotaInfo } from "@/api/videos"
import { getCategories } from "@/api/categories"
import { useAuth } from "@/hooks/useAuth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"
import { formatFileSize } from "@/lib/formatters"

export const Route = createFileRoute("/_auth/upload")({
  component: UploadPage
})

const ACCEPTED_FORMATS = ["mp4", "mov", "avi", "mkv", "webm"]

function UploadPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [categoryId, setCategoryId] = useState<string>("")
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

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

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: (data: { file: File, metadata: { title: string, description?: string, category_id?: string } }) =>
      uploadVideo(data.file, data.metadata, setUploadProgress),
    onSuccess: (video) => {
      toast.success("Video uploaded successfully! Processing started.")
      refetchQuota()
      // Redirect to user's profile page
      if (user) {
        navigate({ to: "/profile/$username", params: { username: user.username } })
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Failed to upload video")
    }
  })

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
      handleFileSelect(files[0])
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFileSelect(files[0])
    }
  }

  const handleFileSelect = (file: File) => {
    // Check file type
    const ext = file.name.split(".").pop()?.toLowerCase()
    if (!ext || !ACCEPTED_FORMATS.includes(ext)) {
      toast.error(`Invalid file type. Accepted formats: ${ACCEPTED_FORMATS.join(", ")}`)
      return
    }

    // Check file size
    const limit = quota?.max_file_size_bytes || 2 * 1024 * 1024 * 1024 // 2GB fallback
    if (file.size > limit) {
      toast.error(`File too large. Maximum size: ${formatFileSize(limit)}`)
      return
    }

    // Check quota
    if (quota && file.size > quota.remaining_bytes) {
      toast.error(`Not enough quota remaining. Need ${formatFileSize(file.size)}, have ${formatFileSize(quota.remaining_bytes)}`)
      return
    }

    setSelectedFile(file)
    // Auto-fill title with filename (without extension)
    if (!title) {
      const filename = file.name.replace(/\.[^/.]+$/, "")
      setTitle(filename)
    }
  }

  const handleUpload = () => {
    if (!selectedFile) {
      toast.error("Please select a file")
      return
    }

    if (!title.trim()) {
      toast.error("Please enter a title")
      return
    }

    uploadMutation.mutate({
      file: selectedFile,
      metadata: {
        title: title.trim(),
        description: description.trim() || undefined,
        category_id: categoryId || undefined
      }
    })
  }

  const handleCancel = () => {
    setSelectedFile(null)
    setTitle("")
    setDescription("")
    setCategoryId("")
    setUploadProgress(0)
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Upload Video</h1>
        <p className="text-muted-foreground text-lg">
          Share your videos with the community
        </p>
      </div>

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
                ⚠️ {quota.percentage_used >= 100 ? "Quota limit reached" : "Low quota remaining"}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* File Selection */}
      <Card>
        <CardContent className="pt-6">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              border-2 border-dashed rounded-xl p-12 text-center 
              transition-all duration-200 cursor-pointer
              ${isDragging 
                ? "border-primary bg-primary/10 scale-[1.02]" 
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-accent/50"
              }
            `}
            onClick={() => document.getElementById("file-input")?.click()}
          >
            {selectedFile ? (
              <div className="space-y-4">
                <div className="inline-flex p-4 rounded-full bg-primary/10">
                  <FileVideo className="w-12 h-12 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-lg">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCancel()
                  }}
                >
                  <X className="w-4 h-4 mr-2" />
                  Remove File
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="inline-flex p-4 rounded-full bg-muted">
                  <Upload className="w-12 h-12 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-lg font-semibold mb-2">
                    Drop your video here or click to browse
                  </p>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p>
                      Accepted formats: <span className="font-medium">{ACCEPTED_FORMATS.join(", ")}</span>
                    </p>
                    <p>
                      Maximum size: <span className="font-medium">{formatFileSize(quota?.max_file_size_bytes || 2 * 1024 * 1024 * 1024)}</span>
                    </p>
                  </div>
                </div>
              </div>
            )}
            <input
              id="file-input"
              type="file"
              accept={ACCEPTED_FORMATS.map(f => `.${f}`).join(",")}
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>
        </CardContent>
      </Card>

      {/* Metadata Form */}
      {selectedFile && (
        <Card>
          <CardHeader>
            <CardTitle>Video Details</CardTitle>
            <CardDescription>Add information about your video</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter video title"
                maxLength={200}
                disabled={uploadMutation.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description (optional)"
                rows={4}
                maxLength={2000}
                disabled={uploadMutation.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId} disabled={uploadMutation.isPending}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {categoriesData?.categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Upload Progress */}
            {uploadMutation.isPending && (
              <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <Label className="text-base">Upload Progress</Label>
                  <span className="text-sm font-semibold">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  Please don't close this page while uploading...
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleUpload}
                disabled={!title.trim() || uploadMutation.isPending}
                className="flex-1"
                size="lg"
              >
                {uploadMutation.isPending ? (
                  <>
                    <Upload className="w-4 h-4 mr-2 animate-pulse" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Video
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={uploadMutation.isPending}
                size="lg"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

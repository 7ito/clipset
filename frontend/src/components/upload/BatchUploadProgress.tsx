import { CheckCircle2, XCircle, Loader2, Upload, ListPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import type { QueuedFile } from "./BatchFileItem"

interface BatchUploadProgressProps {
  files: QueuedFile[]
  currentIndex: number
  playlistName?: string
  onViewPlaylist?: () => void
  onViewProfile?: () => void
  onUploadMore?: () => void
  isComplete: boolean
}

export function BatchUploadProgress({
  files,
  currentIndex,
  playlistName,
  onViewPlaylist,
  onViewProfile,
  onUploadMore,
  isComplete
}: BatchUploadProgressProps) {
  const completedCount = files.filter((f) => f.status === "complete").length
  const failedCount = files.filter((f) => f.status === "failed").length
  const totalCount = files.length

  // Calculate overall progress
  const overallProgress = Math.round((completedCount / totalCount) * 100)

  if (isComplete) {
    // Show completion summary
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          {failedCount === 0 ? (
            <>
              <div className="inline-flex p-4 rounded-full bg-green-500/10">
                <CheckCircle2 className="w-12 h-12 text-green-500" />
              </div>
              <h3 className="text-xl font-semibold">Upload Complete!</h3>
              <p className="text-muted-foreground">
                Successfully uploaded {completedCount} {completedCount === 1 ? "video" : "videos"}
                {playlistName && ` to "${playlistName}"`}
              </p>
            </>
          ) : (
            <>
              <div className="inline-flex p-4 rounded-full bg-yellow-500/10">
                <XCircle className="w-12 h-12 text-yellow-500" />
              </div>
              <h3 className="text-xl font-semibold">Upload Finished with Errors</h3>
              <p className="text-muted-foreground">
                {completedCount} succeeded, {failedCount} failed
              </p>
            </>
          )}
        </div>

        {/* Summary List */}
        <div className="max-h-48 overflow-y-auto space-y-2">
        {files.map((file) => (
          <div
            key={file.id}
            className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
          >
            {file.status === "complete" ? (
              <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />
            )}
            <span className="text-sm truncate flex-1">{file.title}</span>
            {file.status === "failed" && file.error && (
              <span className="text-xs text-destructive truncate max-w-[150px]">
                {file.error}
              </span>
            )}
          </div>
        ))}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          {playlistName && onViewPlaylist && (
            <Button onClick={onViewPlaylist} className="flex-1">
              <ListPlus className="w-4 h-4 mr-2" />
              View Playlist
            </Button>
          )}
          <Button
            onClick={onViewProfile}
            variant={playlistName ? "outline" : "default"}
            className="flex-1"
          >
            Go to Profile
          </Button>
          <Button onClick={onUploadMore} variant="outline" className="flex-1">
            Upload More
          </Button>
        </div>
      </div>
    )
  }

  // Show progress during upload
  return (
    <div className="space-y-6">
      {/* Overall Progress */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary animate-pulse" />
            Uploading Videos
          </h3>
          <span className="text-sm text-muted-foreground">
            {completedCount} of {totalCount} complete
          </span>
        </div>
        <Progress value={overallProgress} className="h-2" />
      </div>

      {/* Current File Progress */}
      {currentIndex < files.length && files[currentIndex].status === "uploading" && (
        <div className="space-y-2 p-4 rounded-lg bg-muted/50">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium truncate flex-1">
              {files[currentIndex].title}
            </span>
            <span className="text-sm text-muted-foreground ml-2">
              {files[currentIndex].progress}%
            </span>
          </div>
          <Progress value={files[currentIndex].progress} className="h-1.5" />
        </div>
      )}

      {/* File List */}
      <div className="max-h-48 overflow-y-auto space-y-1.5">
        {files.map((file, index) => (
          <div
            key={file.id}
            className="flex items-center gap-3 p-2 rounded text-sm"
          >
            <span className="w-6 text-center text-muted-foreground">
              {index + 1}.
            </span>
            
            {/* Status Icon */}
            <div className="w-5 flex-shrink-0">
              {file.status === "complete" && (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              )}
              {file.status === "failed" && (
                <XCircle className="w-4 h-4 text-destructive" />
              )}
              {file.status === "uploading" && (
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              )}
              {file.status === "processing" && (
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
              )}
              {file.status === "pending" && (
                <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />
              )}
            </div>

            {/* Title */}
            <span className="truncate flex-1">{file.title}</span>
          </div>
        ))}
      </div>

      {/* Warning */}
      <p className="text-xs text-muted-foreground text-center">
        Please don't close this page while uploading...
      </p>
    </div>
  )
}

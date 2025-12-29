import { useState, useEffect } from "react"
import { Copy, Check } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { formatTimestamp } from "@/lib/timestamps"
import { toast } from "@/lib/toast"

interface ShareDialogProps {
  isOpen: boolean
  onClose: () => void
  videoUrl: string
  currentTime: number
}

export function ShareDialog({ isOpen, onClose, videoUrl, currentTime }: ShareDialogProps) {
  const [includeTimestamp, setIncludeTimestamp] = useState(false)
  const [copied, setCopied] = useState(false)
  
  const displayUrl = includeTimestamp 
    ? `${videoUrl}?t=${Math.floor(currentTime)}`
    : videoUrl

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayUrl)
      setCopied(true)
      toast.success("Link copied to clipboard")
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      toast.error("Failed to copy link")
    }
  }

  // Reset includeTimestamp when dialog opens
  useEffect(() => {
    if (isOpen) {
      setIncludeTimestamp(false)
      setCopied(false)
    }
  }, [isOpen])

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md rounded-none">
        <DialogHeader>
          <DialogTitle>Share video</DialogTitle>
          <DialogDescription>
            Anyone with the link will be able to view this video.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center space-x-2 pt-4">
          <div className="grid flex-1 gap-2">
            <Label htmlFor="link" className="sr-only">
              Link
            </Label>
            <Input
              id="link"
              value={displayUrl}
              readOnly
              className="rounded-none bg-accent/20 border-none"
            />
          </div>
          <Button type="button" size="sm" className="px-3" onClick={handleCopy}>
            <span className="sr-only">Copy</span>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <div className="flex items-center space-x-2 pt-2">
          {currentTime > 0 && (
            <div className="flex items-center space-x-2">
              <Switch
                id="start-at"
                checked={includeTimestamp}
                onCheckedChange={setIncludeTimestamp}
                size="sm"
              />
              <Label htmlFor="start-at" className="text-xs cursor-pointer">
                Start at {formatTimestamp(currentTime)}
              </Label>
            </div>
          )}
        </div>
        <DialogFooter className="sm:justify-start pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

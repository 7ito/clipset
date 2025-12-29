import { toast } from "@/lib/toast"
import { formatTimestampUrl } from "@/lib/timestamps"

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      toast.success("Copied to clipboard")
      return true
    } else {
      // Fallback for older browsers or non-secure contexts
      const textArea = document.createElement("textarea")
      textArea.value = text
      textArea.style.position = "fixed"
      textArea.style.left = "-999999px"
      textArea.style.top = "-999999px"
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      
      const successful = document.execCommand("copy")
      textArea.remove()
      
      if (successful) {
        toast.success("Copied to clipboard")
        return true
      } else {
        throw new Error("Copy command failed")
      }
    }
  } catch (error) {
    console.error("Failed to copy to clipboard:", error)
    toast.error("Failed to copy to clipboard")
    return false
  }
}

/**
 * Copy a video URL with optional timestamp
 */
export async function copyVideoLink(
  baseUrl: string, 
  timestamp?: number,
  showToast = true
): Promise<boolean> {
  const url = timestamp !== undefined && timestamp > 0 
    ? formatTimestampUrl(baseUrl, timestamp)
    : baseUrl
  
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url)
      if (showToast) {
        toast.success(timestamp ? "Link with timestamp copied" : "Link copied")
      }
      return true
    } else {
      const textArea = document.createElement("textarea")
      textArea.value = url
      textArea.style.position = "fixed"
      textArea.style.left = "-999999px"
      textArea.style.top = "-999999px"
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      
      const successful = document.execCommand("copy")
      textArea.remove()
      
      if (successful) {
        if (showToast) {
          toast.success(timestamp ? "Link with timestamp copied" : "Link copied")
        }
        return true
      } else {
        throw new Error("Copy command failed")
      }
    }
  } catch (error) {
    console.error("Failed to copy to clipboard:", error)
    if (showToast) {
      toast.error("Failed to copy link")
    }
    return false
  }
}

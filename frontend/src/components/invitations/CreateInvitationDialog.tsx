import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useCreateInvitation } from "@/api/invitations"
import { invitationCreateSchema, type InvitationCreateFormData } from "@/lib/validations/invitations"
import { copyToClipboard } from "@/lib/clipboard"
import { toast } from "@/lib/toast"
import { getErrorMessage } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface CreateInvitationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateInvitationDialog({ open, onOpenChange }: CreateInvitationDialogProps) {
  const createInvitation = useCreateInvitation()
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<InvitationCreateFormData>({
    resolver: zodResolver(invitationCreateSchema),
  })

  const onSubmit = async (data: InvitationCreateFormData) => {
    try {
      const result = await createInvitation.mutateAsync(data)
      
      // Copy the invitation link to clipboard
      await copyToClipboard(result.invitation_link)
      
      // Show success toast
      toast.success("Invitation created! Link copied to clipboard")
      
      // Reset form and close dialog
      reset()
      onOpenChange(false)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Invitation</DialogTitle>
          <DialogDescription>
            Send an invitation to a new user. They will receive a registration link.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="email">Email Address</FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder="user@example.com"
              autoComplete="email"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </Field>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createInvitation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createInvitation.isPending}>
              {createInvitation.isPending ? "Creating..." : "Create Invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

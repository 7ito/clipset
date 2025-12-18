import { z } from "zod"

export const invitationCreateSchema = z.object({
  email: z.string().email("Invalid email address")
})

export type InvitationCreateFormData = z.infer<typeof invitationCreateSchema>

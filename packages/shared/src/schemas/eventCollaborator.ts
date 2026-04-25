import { z } from 'zod'

// Invite a collaborator
export const inviteCollaboratorSchema = z.object({
  email: z.string().email('Invalid email address'),
  canEdit: z.boolean().optional().default(false),
  canPublish: z.boolean().optional().default(false),
  canManageTickets: z.boolean().optional().default(false),
  canCheckIn: z.boolean().optional().default(true),
  canManageAttendees: z.boolean().optional().default(false),
  canViewTickets: z.boolean().optional().default(false),
  canViewAnalytics: z.boolean().optional().default(true),
  canManageFinances: z.boolean().optional().default(false),
})

// Update collaborator permissions
export const updateCollaboratorSchema = z.object({
  canEdit: z.boolean().optional(),
  canPublish: z.boolean().optional(),
  canManageTickets: z.boolean().optional(),
  canCheckIn: z.boolean().optional(),
  canManageAttendees: z.boolean().optional(),
  canViewTickets: z.boolean().optional(),
  canViewAnalytics: z.boolean().optional(),
  canManageFinances: z.boolean().optional(),
})

// Types
export type InviteCollaboratorInput = z.infer<typeof inviteCollaboratorSchema>
export type UpdateCollaboratorInput = z.infer<typeof updateCollaboratorSchema>

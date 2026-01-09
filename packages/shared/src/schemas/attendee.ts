import { z } from 'zod'

export const rsvpStatus = z.enum(['pending', 'confirmed', 'declined', 'waitlisted', 'cancelled'])

export const createRsvpSchema = z.object({
  eventId: z.string().uuid(),
  message: z.string().max(500).optional(), // Optional message to organizer
  // Guest checkout fields
  isGuest: z.boolean().optional(),
  guestName: z.string().min(2).max(100).optional(),
  guestEmail: z.string().email().optional(),
}).refine(
  (data) => {
    // If isGuest is true, guestName and guestEmail are required
    if (data.isGuest) {
      return !!data.guestName && !!data.guestEmail
    }
    return true
  },
  { message: 'Guest name and email are required for guest RSVP' }
)

export const updateRsvpStatusSchema = z.object({
  status: z.enum(['confirmed', 'declined', 'waitlisted']),
  notes: z.string().max(500).optional(), // Organizer notes
})

export const bulkUpdateRsvpSchema = z.object({
  attendeeIds: z.array(z.string().uuid()).min(1).max(100),
  status: z.enum(['confirmed', 'declined', 'waitlisted']),
})

export const inviteAttendeesSchema = z.object({
  eventId: z.string().uuid(),
  emails: z.array(z.string().email()).min(1).max(100),
  message: z.string().max(1000).optional(), // Custom invitation message
})

export const attendeeCheckInSchema = z.object({
  qrCode: z.string().min(1),
})

export const attendeeFiltersSchema = z.object({
  status: rsvpStatus.optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

// Types
export type RsvpStatus = z.infer<typeof rsvpStatus>
export type CreateRsvpInput = z.infer<typeof createRsvpSchema>
export type UpdateRsvpStatusInput = z.infer<typeof updateRsvpStatusSchema>
export type BulkUpdateRsvpInput = z.infer<typeof bulkUpdateRsvpSchema>
export type InviteAttendeesInput = z.infer<typeof inviteAttendeesSchema>
export type AttendeeCheckInInput = z.infer<typeof attendeeCheckInSchema>
export type AttendeeFilters = z.infer<typeof attendeeFiltersSchema>

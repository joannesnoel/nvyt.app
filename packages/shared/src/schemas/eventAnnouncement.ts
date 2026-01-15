import { z } from 'zod'

export const createEventAnnouncementSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  content: z.string().min(1, 'Content is required').max(5000),
  isPinned: z.boolean().optional().default(false),
  isPublished: z.boolean().optional().default(true),
})

export const updateEventAnnouncementSchema = createEventAnnouncementSchema.partial()

// Types
export type CreateEventAnnouncementInput = z.infer<typeof createEventAnnouncementSchema>
export type UpdateEventAnnouncementInput = z.infer<typeof updateEventAnnouncementSchema>

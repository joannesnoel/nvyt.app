import { z } from 'zod'

export const createEventFaqSchema = z.object({
  eventId: z.string().uuid(),
  question: z.string().min(1).max(500),
  answer: z.string().min(1).max(2000),
})

export const updateEventFaqSchema = createEventFaqSchema
  .partial()
  .omit({ eventId: true })

export const reorderFaqsSchema = z.object({
  faqIds: z.array(z.string().uuid()),
})

// Types
export type CreateEventFaqInput = z.infer<typeof createEventFaqSchema>
export type UpdateEventFaqInput = z.infer<typeof updateEventFaqSchema>

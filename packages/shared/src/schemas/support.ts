import { z } from 'zod'

export const supportConversationStatus = z.enum([
  'open',
  'waiting_on_visitor',
  'waiting_on_support',
  'resolved',
  'closed',
])

export const supportMessageSenderType = z.enum([
  'visitor',
  'admin',
  'organizer',
  'system',
])

export const createConversationSchema = z.object({
  visitorName: z.string().min(1, 'Name is required').max(100),
  visitorEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  visitorToken: z.string().min(10, 'Invalid visitor token'),
  eventId: z.string().uuid().optional(),
  subject: z.string().max(200).optional(),
  message: z.string().min(1, 'Message is required').max(5000),
})

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(5000).optional(),
})

export const updateConversationSchema = z.object({
  status: supportConversationStatus.optional(),
  assigneeId: z.string().uuid().nullable().optional(),
})

export type CreateConversationInput = z.infer<typeof createConversationSchema>
export type SendMessageInput = z.infer<typeof sendMessageSchema>
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>

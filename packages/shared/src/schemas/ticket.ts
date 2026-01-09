import { z } from 'zod'

export const ticketTypeStatus = z.enum(['active', 'sold_out', 'disabled'])
export const ticketStatus = z.enum(['pending', 'confirmed', 'cancelled', 'checked_in', 'refunded'])
export const paymentStatus = z.enum(['pending', 'paid', 'failed', 'refunded'])

// Helper to validate datetime strings (accepts both datetime-local and ISO 8601 formats)
const datetimeString = z.string().refine((val) => {
  if (!val) return true
  const date = new Date(val)
  return !isNaN(date.getTime())
}, { message: 'Invalid datetime' })

// Helper to handle empty string as undefined for optional datetime fields
const optionalDatetime = z.union([
  datetimeString,
  z.literal(''),
]).optional().transform(val => (val === '' || val === undefined) ? undefined : val)

export const createTicketTypeSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  price: z.number().min(0),
  quantity: z.number().int().positive().nullable().optional().transform(val => val ?? undefined), // null = unlimited
  salesStart: optionalDatetime,
  salesEnd: optionalDatetime,
  maxPerOrder: z.number().int().positive().default(10),
  minPerOrder: z.number().int().positive().default(1),
})

export const updateTicketTypeSchema = createTicketTypeSchema.partial().omit({ eventId: true })

export const purchaseTicketsSchema = z.object({
  eventId: z.string().uuid(),
  items: z.array(z.object({
    ticketTypeId: z.string().uuid(),
    quantity: z.number().int().positive(),
    attendees: z.array(z.object({
      name: z.string().min(1),
      email: z.string().email(),
    })).optional(),
  })).min(1),
  customerName: z.string().min(1),
  customerEmail: z.string().email(),
  customerPhone: z.string().optional(),
  isGuest: z.boolean().optional().default(false),
})

export const checkInSchema = z.object({
  qrCode: z.string(),
})

// Types
export type TicketTypeStatus = z.infer<typeof ticketTypeStatus>
export type TicketStatus = z.infer<typeof ticketStatus>
export type PaymentStatus = z.infer<typeof paymentStatus>
export type CreateTicketTypeInput = z.infer<typeof createTicketTypeSchema>
export type UpdateTicketTypeInput = z.infer<typeof updateTicketTypeSchema>
export type PurchaseTicketsInput = z.infer<typeof purchaseTicketsSchema>
export type CheckInInput = z.infer<typeof checkInSchema>

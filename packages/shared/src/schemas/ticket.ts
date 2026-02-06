import { z } from 'zod'

export const ticketTypeStatus = z.enum(['active', 'sold_out', 'disabled'])
export const ticketStatus = z.enum(['pending', 'confirmed', 'cancelled', 'checked_in', 'refunded'])
export const paymentStatus = z.enum(['pending', 'paid', 'failed', 'refunded'])
export const priceTierType = z.enum(['time', 'quantity', 'hybrid'])

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

// Reusable HTML description validator: allows up to 2000 chars raw (HTML overhead),
// but text content (tags stripped) must be ≤ 500 chars.
function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}

export const htmlDescription = z.string().max(2000).optional()
  .refine((val) => {
    if (!val) return true
    return stripHtmlTags(val).length <= 500
  }, { message: 'Description text must be 500 characters or fewer' })

export const createTicketTypeSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: htmlDescription,
  price: z.number().min(0),
  quantity: z.number().int().positive().nullable().optional().transform(val => val ?? undefined), // null = unlimited
  salesStart: optionalDatetime,
  salesEnd: optionalDatetime,
  maxPerOrder: z.number().int().positive().default(10),
  minPerOrder: z.number().int().positive().default(1),
  // Display settings
  showAvailability: z.boolean().default(true),
  showNextTierPrice: z.boolean().default(true),
})

export const updateTicketTypeSchema = createTicketTypeSchema.partial().omit({ eventId: true })

export const paymentProviderEnum = z.enum(['paymongo', 'paypal'])

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
  // Payment provider selection
  paymentProvider: paymentProviderEnum.optional().default('paymongo'),
  // Event requirement responses
  requirementResponses: z.array(z.object({
    requirementId: z.string().uuid(),
    response: z.boolean(),
  })).optional(),
  // Discount/promo code
  discountCode: z.string().optional(),
})

export const checkInSchema = z.object({
  qrCode: z.string(),
})

// Helper to validate optional datetime strings
const optionalDatetimeRefine = z.string().refine((val) => {
  if (!val) return true
  const date = new Date(val)
  return !isNaN(date.getTime())
}, { message: 'Invalid date' }).optional().nullable()

// Price tier base schema (without refinements for partial use)
const priceTierBaseSchema = z.object({
  ticketTypeId: z.string().uuid(),
  name: z.string().min(1).max(100),
  price: z.number().min(0),
  tierType: priceTierType.default('time'),
  // Time-based fields (required for 'time' and 'hybrid' tiers)
  startDate: optionalDatetimeRefine,
  endDate: optionalDatetimeRefine,
  // Quantity-based fields (required for 'quantity' and 'hybrid' tiers)
  quantityLimit: z.number().int().positive().optional().nullable(),
  sortOrder: z.number().int().optional().default(0),
})

// Price tier schemas with conditional validation
export const createPriceTierSchema = priceTierBaseSchema
  .refine((data) => {
    // Time tiers require dates
    if (data.tierType === 'time') {
      return data.startDate && data.endDate
    }
    return true
  }, { message: 'Time-based tiers require start and end dates', path: ['startDate'] })
  .refine((data) => {
    // Quantity tiers require quantityLimit
    if (data.tierType === 'quantity') {
      return data.quantityLimit !== undefined && data.quantityLimit !== null && data.quantityLimit > 0
    }
    return true
  }, { message: 'Quantity-based tiers require a quantity limit', path: ['quantityLimit'] })
  .refine((data) => {
    // Hybrid tiers require both
    if (data.tierType === 'hybrid') {
      const hasDates = data.startDate && data.endDate
      const hasQuantity = data.quantityLimit !== undefined && data.quantityLimit !== null && data.quantityLimit > 0
      return hasDates && hasQuantity
    }
    return true
  }, { message: 'Hybrid tiers require both dates and quantity limit', path: ['tierType'] })
  .refine((data) => {
    // If dates are provided, end must be after start
    if (data.startDate && data.endDate) {
      const start = new Date(data.startDate)
      const end = new Date(data.endDate)
      return end > start
    }
    return true
  }, { message: 'End date must be after start date', path: ['endDate'] })

export const updatePriceTierSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  price: z.number().min(0).optional(),
  tierType: priceTierType.optional(),
  startDate: optionalDatetimeRefine,
  endDate: optionalDatetimeRefine,
  quantityLimit: z.number().int().positive().optional().nullable(),
  sortOrder: z.number().int().optional(),
})

// Types
export type TicketTypeStatus = z.infer<typeof ticketTypeStatus>
export type TicketStatus = z.infer<typeof ticketStatus>
export type PaymentStatus = z.infer<typeof paymentStatus>
export type PriceTierType = z.infer<typeof priceTierType>
export type CreateTicketTypeInput = z.infer<typeof createTicketTypeSchema>
export type UpdateTicketTypeInput = z.infer<typeof updateTicketTypeSchema>
export type PurchaseTicketsInput = z.infer<typeof purchaseTicketsSchema>
export type CheckInInput = z.infer<typeof checkInSchema>
export type CreatePriceTierInput = z.infer<typeof createPriceTierSchema>
export type UpdatePriceTierInput = z.infer<typeof updatePriceTierSchema>
export type PaymentProvider = z.infer<typeof paymentProviderEnum>

// Discount code schemas
export const discountTypeEnum = z.enum(['percentage', 'fixed'])

export const createDiscountCodeSchema = z.object({
  code: z.string().min(1).max(50).transform(val => val.toUpperCase()),
  description: z.string().max(500).optional(),
  discountType: discountTypeEnum,
  discountValue: z.number().positive(),
  usageLimit: z.number().int().positive().nullable().optional(),
  ticketTypeIds: z.array(z.string().uuid()).nullable().optional(),
  isActive: z.boolean().default(true),
}).refine((data) => {
  if (data.discountType === 'percentage' && data.discountValue > 100) {
    return false
  }
  return true
}, { message: 'Percentage discount cannot exceed 100%', path: ['discountValue'] })

export const updateDiscountCodeSchema = z.object({
  code: z.string().min(1).max(50).transform(val => val.toUpperCase()).optional(),
  description: z.string().max(500).optional().nullable(),
  discountType: discountTypeEnum.optional(),
  discountValue: z.number().positive().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  ticketTypeIds: z.array(z.string().uuid()).nullable().optional(),
  isActive: z.boolean().optional(),
})

export const validateDiscountCodeSchema = z.object({
  code: z.string().min(1),
  eventId: z.string().uuid(),
  items: z.array(z.object({
    ticketTypeId: z.string().uuid(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().min(0),
  })),
})

export type DiscountType = z.infer<typeof discountTypeEnum>
export type CreateDiscountCodeInput = z.infer<typeof createDiscountCodeSchema>
export type UpdateDiscountCodeInput = z.infer<typeof updateDiscountCodeSchema>
export type ValidateDiscountCodeInput = z.infer<typeof validateDiscountCodeSchema>

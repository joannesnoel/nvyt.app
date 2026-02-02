import { discountCodes } from '@nvyt/db'
import { validateDiscountCodeSchema } from '@nvyt/shared'
import { eq, and } from 'drizzle-orm'
import { calculateDiscount } from '~/server/utils/discount'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const body = await readBody(event)

  if (!eventId) {
    throw createError({ statusCode: 400, message: 'Event ID is required' })
  }

  const result = validateDiscountCodeSchema.safeParse({ ...body, eventId })
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const data = result.data
  const db = useDatabase()

  // Look up the code
  const [code] = await db
    .select()
    .from(discountCodes)
    .where(and(
      eq(discountCodes.eventId, eventId),
      eq(discountCodes.code, data.code.toUpperCase()),
    ))
    .limit(1)

  if (!code) {
    throw createError({ statusCode: 404, message: 'Invalid discount code' })
  }

  if (!code.isActive) {
    throw createError({ statusCode: 400, message: 'This discount code is no longer active' })
  }

  if (code.usageLimit !== null && code.usageCount >= code.usageLimit) {
    throw createError({ statusCode: 400, message: 'This discount code has reached its usage limit' })
  }

  // Check ticket type restrictions
  const applicableTicketTypeIds = code.ticketTypeIds as string[] | null
  const applicableItems = data.items.filter(item => {
    if (!applicableTicketTypeIds || applicableTicketTypeIds.length === 0) return true
    return applicableTicketTypeIds.includes(item.ticketTypeId)
  })

  if (applicableItems.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'This discount code does not apply to any of the selected ticket types',
    })
  }

  const discountAmount = calculateDiscount(
    code.discountType,
    parseFloat(code.discountValue),
    data.items,
    applicableTicketTypeIds,
  )

  return successResponse({
    code: code.code,
    discountType: code.discountType,
    discountValue: parseFloat(code.discountValue),
    applicableTicketTypeIds,
    discountAmount,
  })
})

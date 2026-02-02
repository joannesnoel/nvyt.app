import { discountCodes } from '@nvyt/db'
import { createDiscountCodeSchema } from '@nvyt/shared'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const body = await readBody(event)

  if (!eventId) {
    throw createError({ statusCode: 400, message: 'Event ID is required' })
  }

  await requireEventAccess(event, eventId, 'canManageTickets')

  const result = createDiscountCodeSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const data = result.data
  const db = useDatabase()

  // Check code uniqueness per event
  const [existing] = await db
    .select({ id: discountCodes.id })
    .from(discountCodes)
    .where(and(eq(discountCodes.eventId, eventId), eq(discountCodes.code, data.code)))
    .limit(1)

  if (existing) {
    throw createError({
      statusCode: 409,
      message: `A discount code "${data.code}" already exists for this event`,
    })
  }

  const [code] = await db
    .insert(discountCodes)
    .values({
      eventId,
      code: data.code,
      description: data.description,
      discountType: data.discountType,
      discountValue: String(data.discountValue),
      usageLimit: data.usageLimit ?? null,
      ticketTypeIds: data.ticketTypeIds ?? null,
      isActive: data.isActive,
    })
    .returning()

  return successResponse(code)
})

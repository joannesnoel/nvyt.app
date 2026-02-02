import { discountCodes } from '@nvyt/db'
import { updateDiscountCodeSchema } from '@nvyt/shared'
import { eq, and, ne } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const codeId = getRouterParam(event, 'codeId')
  const body = await readBody(event)

  if (!eventId || !codeId) {
    throw createError({ statusCode: 400, message: 'Event ID and Code ID are required' })
  }

  await requireEventAccess(event, eventId, 'canManageTickets')

  const result = updateDiscountCodeSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const data = result.data
  const db = useDatabase()

  // Verify the code belongs to this event
  const [existing] = await db
    .select()
    .from(discountCodes)
    .where(and(eq(discountCodes.id, codeId), eq(discountCodes.eventId, eventId)))
    .limit(1)

  if (!existing) {
    throw createError({ statusCode: 404, message: 'Discount code not found' })
  }

  // If code is being changed, check uniqueness
  if (data.code && data.code !== existing.code) {
    const [duplicate] = await db
      .select({ id: discountCodes.id })
      .from(discountCodes)
      .where(and(
        eq(discountCodes.eventId, eventId),
        eq(discountCodes.code, data.code),
        ne(discountCodes.id, codeId),
      ))
      .limit(1)

    if (duplicate) {
      throw createError({
        statusCode: 409,
        message: `A discount code "${data.code}" already exists for this event`,
      })
    }
  }

  // Validate percentage if both type and value are being updated or one changes
  const finalType = data.discountType ?? existing.discountType
  const finalValue = data.discountValue ?? parseFloat(existing.discountValue)
  if (finalType === 'percentage' && finalValue > 100) {
    throw createError({
      statusCode: 400,
      message: 'Percentage discount cannot exceed 100%',
    })
  }

  const updateData: Record<string, any> = { updatedAt: new Date() }
  if (data.code !== undefined) updateData.code = data.code
  if (data.description !== undefined) updateData.description = data.description
  if (data.discountType !== undefined) updateData.discountType = data.discountType
  if (data.discountValue !== undefined) updateData.discountValue = String(data.discountValue)
  if (data.usageLimit !== undefined) updateData.usageLimit = data.usageLimit
  if (data.ticketTypeIds !== undefined) updateData.ticketTypeIds = data.ticketTypeIds
  if (data.isActive !== undefined) updateData.isActive = data.isActive

  const [updated] = await db
    .update(discountCodes)
    .set(updateData)
    .where(eq(discountCodes.id, codeId))
    .returning()

  return successResponse(updated)
})

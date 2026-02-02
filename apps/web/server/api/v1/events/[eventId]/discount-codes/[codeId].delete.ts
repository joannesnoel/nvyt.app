import { discountCodes } from '@nvyt/db'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const codeId = getRouterParam(event, 'codeId')

  if (!eventId || !codeId) {
    throw createError({ statusCode: 400, message: 'Event ID and Code ID are required' })
  }

  await requireEventAccess(event, eventId, 'canManageTickets')

  const db = useDatabase()

  const [existing] = await db
    .select()
    .from(discountCodes)
    .where(and(eq(discountCodes.id, codeId), eq(discountCodes.eventId, eventId)))
    .limit(1)

  if (!existing) {
    throw createError({ statusCode: 404, message: 'Discount code not found' })
  }

  if (existing.usageCount > 0) {
    throw createError({
      statusCode: 400,
      message: 'Cannot delete a discount code that has been used. Deactivate it instead.',
    })
  }

  await db
    .delete(discountCodes)
    .where(eq(discountCodes.id, codeId))

  return successResponse({ deleted: true })
})

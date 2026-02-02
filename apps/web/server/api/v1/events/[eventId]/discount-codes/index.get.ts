import { discountCodes } from '@nvyt/db'
import { eq, desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')

  if (!eventId) {
    throw createError({ statusCode: 400, message: 'Event ID is required' })
  }

  await requireEventAccess(event, eventId, 'canManageTickets')

  const db = useDatabase()

  const codes = await db
    .select()
    .from(discountCodes)
    .where(eq(discountCodes.eventId, eventId))
    .orderBy(desc(discountCodes.createdAt))

  return successResponse(codes)
})

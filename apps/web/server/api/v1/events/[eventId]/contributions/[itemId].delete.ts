import { contributionItems } from '@nvyt/db'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const itemId = getRouterParam(event, 'itemId')

  if (!eventId || !itemId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID and Item ID are required',
    })
  }

  // Require canEdit permission
  await requireEventAccess(event, eventId, 'canEdit')

  const db = useDatabase()

  // Check item exists and belongs to this event
  const [existingItem] = await db
    .select()
    .from(contributionItems)
    .where(
      and(
        eq(contributionItems.id, itemId),
        eq(contributionItems.eventId, eventId)
      )
    )
    .limit(1)

  if (!existingItem) {
    throw createError({
      statusCode: 404,
      message: 'Contribution item not found',
    })
  }

  // Delete item (claims will cascade delete due to DB constraint)
  await db
    .delete(contributionItems)
    .where(eq(contributionItems.id, itemId))

  return successResponse({ deleted: true })
})

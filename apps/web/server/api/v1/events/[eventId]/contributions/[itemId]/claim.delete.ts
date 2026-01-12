import { contributionItems, contributionClaims } from '@nvyt/db'
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

  // Require authentication
  const user = await requireAuth(event)

  const db = useDatabase()

  // Check contribution item exists
  const [item] = await db
    .select()
    .from(contributionItems)
    .where(
      and(
        eq(contributionItems.id, itemId),
        eq(contributionItems.eventId, eventId)
      )
    )
    .limit(1)

  if (!item) {
    throw createError({
      statusCode: 404,
      message: 'Contribution item not found',
    })
  }

  // Find user's claim for this item
  const [claim] = await db
    .select()
    .from(contributionClaims)
    .where(
      and(
        eq(contributionClaims.contributionItemId, itemId),
        eq(contributionClaims.userId, user.id)
      )
    )
    .limit(1)

  if (!claim) {
    throw createError({
      statusCode: 404,
      message: 'You have not claimed this item',
    })
  }

  // Delete the claim
  await db
    .delete(contributionClaims)
    .where(eq(contributionClaims.id, claim.id))

  // Update claimed count on the item
  await db
    .update(contributionItems)
    .set({
      quantityClaimed: Math.max(0, item.quantityClaimed - claim.quantity),
      updatedAt: new Date(),
    })
    .where(eq(contributionItems.id, itemId))

  return successResponse({ deleted: true })
})

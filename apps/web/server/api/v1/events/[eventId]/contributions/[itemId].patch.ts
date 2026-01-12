import { contributionItems } from '@nvyt/db'
import { updateContributionItemSchema } from '@nvyt/shared'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const itemId = getRouterParam(event, 'itemId')
  const body = await readBody(event)

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

  // Validate input
  const result = updateContributionItemSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const data = result.data

  // Validate new quantity if provided
  if (data.quantityNeeded !== undefined && data.quantityNeeded < existingItem.quantityClaimed) {
    throw createError({
      statusCode: 400,
      message: `Cannot reduce quantity below already claimed amount (${existingItem.quantityClaimed})`,
    })
  }

  // Update item
  const [updatedItem] = await db
    .update(contributionItems)
    .set({
      ...(data.name && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.category && { category: data.category }),
      ...(data.quantityNeeded !== undefined && { quantityNeeded: data.quantityNeeded }),
      updatedAt: new Date(),
    })
    .where(eq(contributionItems.id, itemId))
    .returning()

  if (!updatedItem) {
    throw createError({
      statusCode: 500,
      message: 'Failed to update contribution item',
    })
  }

  return successResponse(updatedItem)
})

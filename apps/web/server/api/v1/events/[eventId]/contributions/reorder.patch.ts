import { contributionItems } from '@nvyt/db'
import { eq, asc } from 'drizzle-orm'
import { z } from 'zod'

const reorderSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1),
})

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const body = await readBody(event)

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  // Require canEdit permission
  await requireEventAccess(event, eventId, 'canEdit')

  const db = useDatabase()

  // Validate input
  const result = reorderSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const { itemIds } = result.data

  // Update sort order for each item
  for (let i = 0; i < itemIds.length; i++) {
    const itemId = itemIds[i]
    if (itemId) {
      await db
        .update(contributionItems)
        .set({
          sortOrder: i,
          updatedAt: new Date(),
        })
        .where(eq(contributionItems.id, itemId))
    }
  }

  // Return updated list
  const updatedItems = await db
    .select()
    .from(contributionItems)
    .where(eq(contributionItems.eventId, eventId))
    .orderBy(asc(contributionItems.sortOrder), asc(contributionItems.createdAt))

  return successResponse(updatedItems)
})

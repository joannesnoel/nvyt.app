import { contributionItems, events } from '@nvyt/db'
import { createContributionItemSchema } from '@nvyt/shared'
import { eq, sql } from 'drizzle-orm'

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

  // Check event exists and has contributions enabled
  const [eventRecord] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)

  if (!eventRecord) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  if (!eventRecord.contributionsEnabled) {
    throw createError({
      statusCode: 400,
      message: 'Contributions are not enabled for this event. Enable them in event settings first.',
    })
  }

  // Validate input
  const result = createContributionItemSchema.safeParse({ ...body, eventId })
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const data = result.data

  // Get current max sort order
  const [maxSort] = await db
    .select({ max: sql<number>`COALESCE(MAX(${contributionItems.sortOrder}), -1)` })
    .from(contributionItems)
    .where(eq(contributionItems.eventId, eventId))

  const sortOrder = (maxSort?.max ?? -1) + 1

  // Create contribution item
  const [newItem] = await db
    .insert(contributionItems)
    .values({
      eventId,
      name: data.name,
      description: data.description,
      category: data.category,
      quantityNeeded: data.quantityNeeded,
      quantityClaimed: 0,
      sortOrder,
    })
    .returning()

  if (!newItem) {
    throw createError({
      statusCode: 500,
      message: 'Failed to create contribution item',
    })
  }

  return successResponse(newItem)
})

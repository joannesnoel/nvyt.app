import { eventFaqs } from '@nvyt/db'
import { createEventFaqSchema } from '@nvyt/shared'
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

  // Validate input
  const result = createEventFaqSchema.safeParse({ ...body, eventId })
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
    .select({ max: sql<number>`COALESCE(MAX(${eventFaqs.sortOrder}), -1)` })
    .from(eventFaqs)
    .where(eq(eventFaqs.eventId, eventId))

  const sortOrder = (maxSort?.max ?? -1) + 1

  // Create FAQ
  const [newFaq] = await db
    .insert(eventFaqs)
    .values({
      eventId,
      question: data.question,
      answer: data.answer,
      sortOrder,
    })
    .returning()

  if (!newFaq) {
    throw createError({
      statusCode: 500,
      message: 'Failed to create FAQ',
    })
  }

  return successResponse(newFaq)
})

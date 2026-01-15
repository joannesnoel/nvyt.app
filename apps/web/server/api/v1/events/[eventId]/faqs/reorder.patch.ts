import { eventFaqs } from '@nvyt/db'
import { reorderFaqsSchema } from '@nvyt/shared'
import { eq, asc } from 'drizzle-orm'

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
  const result = reorderFaqsSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const { faqIds } = result.data

  // Update sort order for each FAQ
  for (let i = 0; i < faqIds.length; i++) {
    const faqId = faqIds[i]
    if (faqId) {
      await db
        .update(eventFaqs)
        .set({
          sortOrder: i,
          updatedAt: new Date(),
        })
        .where(eq(eventFaqs.id, faqId))
    }
  }

  // Return updated list
  const updatedFaqs = await db
    .select()
    .from(eventFaqs)
    .where(eq(eventFaqs.eventId, eventId))
    .orderBy(asc(eventFaqs.sortOrder), asc(eventFaqs.createdAt))

  return successResponse(updatedFaqs)
})

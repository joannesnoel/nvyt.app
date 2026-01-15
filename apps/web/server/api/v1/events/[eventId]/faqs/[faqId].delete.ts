import { eventFaqs } from '@nvyt/db'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const faqId = getRouterParam(event, 'faqId')

  if (!eventId || !faqId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID and FAQ ID are required',
    })
  }

  // Require canEdit permission
  await requireEventAccess(event, eventId, 'canEdit')

  const db = useDatabase()

  // Check FAQ exists and belongs to this event
  const [existingFaq] = await db
    .select()
    .from(eventFaqs)
    .where(
      and(
        eq(eventFaqs.id, faqId),
        eq(eventFaqs.eventId, eventId)
      )
    )
    .limit(1)

  if (!existingFaq) {
    throw createError({
      statusCode: 404,
      message: 'FAQ not found',
    })
  }

  // Delete FAQ
  await db
    .delete(eventFaqs)
    .where(eq(eventFaqs.id, faqId))

  return successResponse({ deleted: true })
})

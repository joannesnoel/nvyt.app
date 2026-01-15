import { eventFaqs, events } from '@nvyt/db'
import { eq, asc, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  const db = useDatabase()
  const currentUser = await getUserFromEvent(event)

  // Verify event exists
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

  const isOrganizer = currentUser?.id === eventRecord.organizerId

  // Build query - organizers see all, public sees only active
  let faqs
  if (isOrganizer) {
    faqs = await db
      .select()
      .from(eventFaqs)
      .where(eq(eventFaqs.eventId, eventId))
      .orderBy(asc(eventFaqs.sortOrder), asc(eventFaqs.createdAt))
  } else {
    faqs = await db
      .select()
      .from(eventFaqs)
      .where(
        and(
          eq(eventFaqs.eventId, eventId),
          eq(eventFaqs.isActive, true)
        )
      )
      .orderBy(asc(eventFaqs.sortOrder), asc(eventFaqs.createdAt))
  }

  return successResponse(faqs)
})

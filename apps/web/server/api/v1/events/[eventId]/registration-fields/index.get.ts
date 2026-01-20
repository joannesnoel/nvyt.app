import { ticketRegistrationFields, events } from '@nvyt/db'
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
  let fields
  if (isOrganizer) {
    fields = await db
      .select()
      .from(ticketRegistrationFields)
      .where(eq(ticketRegistrationFields.eventId, eventId))
      .orderBy(asc(ticketRegistrationFields.sortOrder), asc(ticketRegistrationFields.createdAt))
  } else {
    fields = await db
      .select()
      .from(ticketRegistrationFields)
      .where(
        and(
          eq(ticketRegistrationFields.eventId, eventId),
          eq(ticketRegistrationFields.isActive, true)
        )
      )
      .orderBy(asc(ticketRegistrationFields.sortOrder), asc(ticketRegistrationFields.createdAt))
  }

  return successResponse(fields)
})

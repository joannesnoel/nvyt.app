import { eventRequirements, events } from '@nvyt/db'
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
  let requirements
  if (isOrganizer) {
    requirements = await db
      .select()
      .from(eventRequirements)
      .where(eq(eventRequirements.eventId, eventId))
      .orderBy(asc(eventRequirements.sortOrder), asc(eventRequirements.createdAt))
  } else {
    requirements = await db
      .select()
      .from(eventRequirements)
      .where(
        and(
          eq(eventRequirements.eventId, eventId),
          eq(eventRequirements.isActive, true)
        )
      )
      .orderBy(asc(eventRequirements.sortOrder), asc(eventRequirements.createdAt))
  }

  return successResponse(requirements)
})

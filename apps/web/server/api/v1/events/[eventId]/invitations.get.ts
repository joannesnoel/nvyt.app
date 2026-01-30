import { eq, desc } from 'drizzle-orm'
import { events, eventInvitations } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const eventId = getRouterParam(event, 'eventId')

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  const db = useDatabase()

  // Verify user is the organizer
  const [eventData] = await db
    .select({ organizerId: events.organizerId })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)

  if (!eventData) {
    throw createError({ statusCode: 404, message: 'Event not found' })
  }

  if (eventData.organizerId !== user.id) {
    throw createError({ statusCode: 403, message: 'Only the organizer can view invitations' })
  }

  const invitations = await db
    .select({
      id: eventInvitations.id,
      name: eventInvitations.name,
      email: eventInvitations.email,
      status: eventInvitations.status,
      invitedAt: eventInvitations.invitedAt,
      acceptedAt: eventInvitations.acceptedAt,
    })
    .from(eventInvitations)
    .where(eq(eventInvitations.eventId, eventId))
    .orderBy(desc(eventInvitations.invitedAt))

  return successResponse(invitations)
})

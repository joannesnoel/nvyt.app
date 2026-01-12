import { eq, and, isNull } from 'drizzle-orm'
import { eventCollaborators, events } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  // Require authentication
  const user = await requireAuth(event)
  const db = useDatabase()

  // Find the pending invitation for this user
  const [invitation] = await db
    .select()
    .from(eventCollaborators)
    .where(
      and(
        eq(eventCollaborators.eventId, eventId),
        eq(eventCollaborators.userId, user.id),
        isNull(eventCollaborators.acceptedAt)
      )
    )
    .limit(1)

  if (!invitation) {
    throw createError({
      statusCode: 404,
      message: 'No pending invitation found for this event',
    })
  }

  // Accept the invitation
  const [updated] = await db
    .update(eventCollaborators)
    .set({
      acceptedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(eventCollaborators.id, invitation.id))
    .returning()

  // Get event details for response
  const [eventData] = await db
    .select({
      id: events.id,
      title: events.title,
      slug: events.slug,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)

  return successResponse({
    collaborator: updated,
    event: eventData,
    message: 'Invitation accepted successfully',
  })
})

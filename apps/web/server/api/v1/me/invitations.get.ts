import { eq, isNull, and } from 'drizzle-orm'
import { eventCollaborators, events, users } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const db = useDatabase()

  // Get all pending invitations for this user
  const invitations = await db
    .select({
      id: eventCollaborators.id,
      eventId: eventCollaborators.eventId,
      canEdit: eventCollaborators.canEdit,
      canPublish: eventCollaborators.canPublish,
      canManageTickets: eventCollaborators.canManageTickets,
      canCheckIn: eventCollaborators.canCheckIn,
      canManageAttendees: eventCollaborators.canManageAttendees,
      canViewAnalytics: eventCollaborators.canViewAnalytics,
      invitedAt: eventCollaborators.invitedAt,
      acceptedAt: eventCollaborators.acceptedAt,
      event: {
        id: events.id,
        title: events.title,
        slug: events.slug,
        coverImage: events.coverImage,
        startDate: events.startDate,
      },
      inviter: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
    .from(eventCollaborators)
    .innerJoin(events, eq(events.id, eventCollaborators.eventId))
    .innerJoin(users, eq(users.id, eventCollaborators.invitedBy))
    .where(
      and(
        eq(eventCollaborators.userId, user.id),
        isNull(eventCollaborators.acceptedAt)
      )
    )
    .orderBy(eventCollaborators.invitedAt)

  return successResponse({
    invitations,
  })
})

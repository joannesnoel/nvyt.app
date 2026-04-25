import { eq } from 'drizzle-orm'
import { eventCollaborators, users } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  // Check access - any collaborator or owner can view the team
  const { isOwner } = await requireEventAccess(event, eventId)

  const db = useDatabase()

  // Get all collaborators with user details
  const collaborators = await db
    .select({
      id: eventCollaborators.id,
      eventId: eventCollaborators.eventId,
      userId: eventCollaborators.userId,
      canEdit: eventCollaborators.canEdit,
      canPublish: eventCollaborators.canPublish,
      canManageTickets: eventCollaborators.canManageTickets,
      canCheckIn: eventCollaborators.canCheckIn,
      canManageAttendees: eventCollaborators.canManageAttendees,
      canViewTickets: eventCollaborators.canViewTickets,
      canViewAnalytics: eventCollaborators.canViewAnalytics,
      canManageFinances: eventCollaborators.canManageFinances,
      invitedBy: eventCollaborators.invitedBy,
      invitedAt: eventCollaborators.invitedAt,
      acceptedAt: eventCollaborators.acceptedAt,
      createdAt: eventCollaborators.createdAt,
      user: {
        id: users.id,
        email: users.email,
        name: users.name,
      },
    })
    .from(eventCollaborators)
    .innerJoin(users, eq(users.id, eventCollaborators.userId))
    .where(eq(eventCollaborators.eventId, eventId))
    .orderBy(eventCollaborators.createdAt)

  return successResponse({
    collaborators,
    isOwner,
  })
})

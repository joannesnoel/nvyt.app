import { eq, and, isNull, isNotNull } from 'drizzle-orm'
import { eventCollaborators, events } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = query.token as string

  if (!token) {
    throw createError({
      statusCode: 400,
      message: 'Token is required',
    })
  }

  const db = useDatabase()

  // Find the pending invitation
  const invitation = await db.query.eventCollaborators.findFirst({
    where: and(
      eq(eventCollaborators.inviteToken, token),
      isNull(eventCollaborators.userId),
      isNotNull(eventCollaborators.invitedEmail)
    ),
    with: {
      event: {
        columns: {
          id: true,
          title: true,
        },
      },
    },
  })

  if (!invitation) {
    throw createError({
      statusCode: 404,
      message: 'Invalid or expired invitation',
    })
  }

  return successResponse({
    email: invitation.invitedEmail,
    eventTitle: invitation.event?.title,
    eventId: invitation.eventId,
  })
})

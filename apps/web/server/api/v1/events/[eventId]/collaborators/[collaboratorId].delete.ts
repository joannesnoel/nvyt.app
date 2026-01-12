import { eq, and } from 'drizzle-orm'
import { eventCollaborators } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const collaboratorId = getRouterParam(event, 'collaboratorId')

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  if (!collaboratorId) {
    throw createError({
      statusCode: 400,
      message: 'Collaborator ID is required',
    })
  }

  // Only owners can remove collaborators
  await requireEventOwner(event, eventId)

  const db = useDatabase()

  // Verify the collaborator exists and belongs to this event
  const existing = await db.query.eventCollaborators.findFirst({
    where: and(
      eq(eventCollaborators.id, collaboratorId),
      eq(eventCollaborators.eventId, eventId)
    ),
  })

  if (!existing) {
    throw createError({
      statusCode: 404,
      message: 'Collaborator not found',
    })
  }

  // Delete the collaborator
  await db
    .delete(eventCollaborators)
    .where(eq(eventCollaborators.id, collaboratorId))

  return successResponse({ success: true })
})

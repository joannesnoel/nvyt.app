import { eventRequirements } from '@nvyt/db'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const requirementId = getRouterParam(event, 'requirementId')

  if (!eventId || !requirementId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID and Requirement ID are required',
    })
  }

  // Require canEdit permission
  await requireEventAccess(event, eventId, 'canEdit')

  const db = useDatabase()

  // Check requirement exists and belongs to this event
  const [existingRequirement] = await db
    .select()
    .from(eventRequirements)
    .where(
      and(
        eq(eventRequirements.id, requirementId),
        eq(eventRequirements.eventId, eventId)
      )
    )
    .limit(1)

  if (!existingRequirement) {
    throw createError({
      statusCode: 404,
      message: 'Requirement not found',
    })
  }

  // Delete requirement
  await db
    .delete(eventRequirements)
    .where(eq(eventRequirements.id, requirementId))

  return successResponse({ deleted: true })
})

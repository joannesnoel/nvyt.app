import { eventRequirements } from '@nvyt/db'
import { reorderRequirementsSchema } from '@nvyt/shared'
import { eq, asc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const body = await readBody(event)

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  // Require canEdit permission
  await requireEventAccess(event, eventId, 'canEdit')

  const db = useDatabase()

  // Validate input
  const result = reorderRequirementsSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const { requirementIds } = result.data

  // Update sort order for each requirement
  for (let i = 0; i < requirementIds.length; i++) {
    const reqId = requirementIds[i]
    if (reqId) {
      await db
        .update(eventRequirements)
        .set({
          sortOrder: i,
          updatedAt: new Date(),
        })
        .where(eq(eventRequirements.id, reqId))
    }
  }

  // Return updated list
  const updatedRequirements = await db
    .select()
    .from(eventRequirements)
    .where(eq(eventRequirements.eventId, eventId))
    .orderBy(asc(eventRequirements.sortOrder), asc(eventRequirements.createdAt))

  return successResponse(updatedRequirements)
})

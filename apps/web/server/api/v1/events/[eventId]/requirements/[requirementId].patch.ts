import { eventRequirements } from '@nvyt/db'
import { updateEventRequirementSchema } from '@nvyt/shared'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const requirementId = getRouterParam(event, 'requirementId')
  const body = await readBody(event)

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

  // Validate input
  const result = updateEventRequirementSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const data = result.data

  // Build update object
  const updateData: Record<string, any> = {
    updatedAt: new Date(),
  }

  if (data.type !== undefined) {
    updateData.type = data.type
  }
  if (data.text !== undefined) {
    updateData.text = data.text
  }
  if (data.description !== undefined) {
    updateData.description = data.description
  }
  if (data.requiredAnswer !== undefined) {
    updateData.requiredAnswer = data.requiredAnswer
  }
  // Handle isActive if provided in body (not in schema but common for toggle)
  if (body.isActive !== undefined) {
    updateData.isActive = body.isActive
  }

  // Update requirement
  const [updatedRequirement] = await db
    .update(eventRequirements)
    .set(updateData)
    .where(eq(eventRequirements.id, requirementId))
    .returning()

  if (!updatedRequirement) {
    throw createError({
      statusCode: 500,
      message: 'Failed to update requirement',
    })
  }

  return successResponse(updatedRequirement)
})

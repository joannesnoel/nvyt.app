import { eventRequirements } from '@nvyt/db'
import { createEventRequirementSchema } from '@nvyt/shared'
import { eq, sql } from 'drizzle-orm'

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
  const result = createEventRequirementSchema.safeParse({ ...body, eventId })
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const data = result.data

  // Get current max sort order
  const [maxSort] = await db
    .select({ max: sql<number>`COALESCE(MAX(${eventRequirements.sortOrder}), -1)` })
    .from(eventRequirements)
    .where(eq(eventRequirements.eventId, eventId))

  const sortOrder = (maxSort?.max ?? -1) + 1

  // Create requirement
  const [newRequirement] = await db
    .insert(eventRequirements)
    .values({
      eventId,
      type: data.type,
      text: data.text,
      description: data.description,
      requiredAnswer: data.type === 'yes_no' ? (data.requiredAnswer ?? true) : null,
      sortOrder,
    })
    .returning()

  if (!newRequirement) {
    throw createError({
      statusCode: 500,
      message: 'Failed to create requirement',
    })
  }

  return successResponse(newRequirement)
})

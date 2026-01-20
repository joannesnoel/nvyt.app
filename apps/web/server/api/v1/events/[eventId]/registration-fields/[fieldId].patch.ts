import { ticketRegistrationFields } from '@nvyt/db'
import { updateRegistrationFieldSchema } from '@nvyt/shared'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const fieldId = getRouterParam(event, 'fieldId')
  const body = await readBody(event)

  if (!eventId || !fieldId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID and Field ID are required',
    })
  }

  // Require canEdit permission
  await requireEventAccess(event, eventId, 'canEdit')

  const db = useDatabase()

  // Validate input
  const result = updateRegistrationFieldSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const data = result.data

  // Verify field exists and belongs to this event
  const [existingField] = await db
    .select()
    .from(ticketRegistrationFields)
    .where(
      and(
        eq(ticketRegistrationFields.id, fieldId),
        eq(ticketRegistrationFields.eventId, eventId)
      )
    )
    .limit(1)

  if (!existingField) {
    throw createError({
      statusCode: 404,
      message: 'Registration field not found',
    })
  }

  // Determine the effective field type (updated or existing)
  const effectiveFieldType = data.fieldType ?? existingField.fieldType

  // Validate options for select/radio types
  if ((effectiveFieldType === 'select' || effectiveFieldType === 'radio')) {
    const effectiveOptions = data.options ?? existingField.options
    if (!effectiveOptions || effectiveOptions.length === 0) {
      throw createError({
        statusCode: 400,
        message: 'Options are required for select and radio field types',
      })
    }
  }

  // Update field
  const [updatedField] = await db
    .update(ticketRegistrationFields)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(ticketRegistrationFields.id, fieldId))
    .returning()

  if (!updatedField) {
    throw createError({
      statusCode: 500,
      message: 'Failed to update registration field',
    })
  }

  return successResponse(updatedField)
})

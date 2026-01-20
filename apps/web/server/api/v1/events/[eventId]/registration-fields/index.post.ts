import { ticketRegistrationFields } from '@nvyt/db'
import { createRegistrationFieldSchema } from '@nvyt/shared'
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
  const result = createRegistrationFieldSchema.safeParse({ ...body, eventId })
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const data = result.data

  // Validate options for select/radio types
  if ((data.fieldType === 'select' || data.fieldType === 'radio') && (!data.options || data.options.length === 0)) {
    throw createError({
      statusCode: 400,
      message: 'Options are required for select and radio field types',
    })
  }

  // Get current max sort order
  const [maxSort] = await db
    .select({ max: sql<number>`COALESCE(MAX(${ticketRegistrationFields.sortOrder}), -1)` })
    .from(ticketRegistrationFields)
    .where(eq(ticketRegistrationFields.eventId, eventId))

  const sortOrder = (maxSort?.max ?? -1) + 1

  // Create registration field
  const [newField] = await db
    .insert(ticketRegistrationFields)
    .values({
      eventId,
      label: data.label,
      fieldType: data.fieldType,
      placeholder: data.placeholder,
      helpText: data.helpText,
      isRequired: data.isRequired ?? true,
      options: data.options,
      validation: data.validation,
      sortOrder,
    })
    .returning()

  if (!newField) {
    throw createError({
      statusCode: 500,
      message: 'Failed to create registration field',
    })
  }

  return successResponse(newField)
})

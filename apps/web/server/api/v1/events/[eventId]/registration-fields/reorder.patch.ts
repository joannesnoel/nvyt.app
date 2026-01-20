import { ticketRegistrationFields } from '@nvyt/db'
import { reorderRegistrationFieldsSchema } from '@nvyt/shared'
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
  const result = reorderRegistrationFieldsSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const { fieldIds } = result.data

  // Update sort order for each field
  for (let i = 0; i < fieldIds.length; i++) {
    const fId = fieldIds[i]
    if (fId) {
      await db
        .update(ticketRegistrationFields)
        .set({
          sortOrder: i,
          updatedAt: new Date(),
        })
        .where(eq(ticketRegistrationFields.id, fId))
    }
  }

  // Return updated list
  const updatedFields = await db
    .select()
    .from(ticketRegistrationFields)
    .where(eq(ticketRegistrationFields.eventId, eventId))
    .orderBy(asc(ticketRegistrationFields.sortOrder), asc(ticketRegistrationFields.createdAt))

  return successResponse(updatedFields)
})

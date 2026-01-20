import { ticketRegistrationFields, tickets } from '@nvyt/db'
import { eq, and, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const fieldId = getRouterParam(event, 'fieldId')

  if (!eventId || !fieldId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID and Field ID are required',
    })
  }

  // Require canEdit permission
  await requireEventAccess(event, eventId, 'canEdit')

  const db = useDatabase()

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

  // Check if any tickets have submitted data for this field
  const [ticketWithData] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tickets)
    .where(
      and(
        eq(tickets.eventId, eventId),
        sql`${tickets.registrationData} ? ${fieldId}`
      )
    )

  const hasSubmittedData = Number(ticketWithData?.count ?? 0) > 0

  if (hasSubmittedData) {
    throw createError({
      statusCode: 400,
      message: 'Cannot delete this field because it has submitted registration data. Disable it instead to hide it from future registrations while preserving existing data.',
    })
  }

  // Delete field (only if no data has been submitted)
  await db
    .delete(ticketRegistrationFields)
    .where(eq(ticketRegistrationFields.id, fieldId))

  return successResponse({ message: 'Registration field deleted successfully' })
})

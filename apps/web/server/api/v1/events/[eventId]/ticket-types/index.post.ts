import { ticketTypes, events } from '@nvyt/db'
import { createTicketTypeSchema } from '@nvyt/shared'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const body = await readBody(event)

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  // Require canManageTickets permission (owner or collaborator)
  await requireEventAccess(event, eventId, 'canManageTickets')

  const db = useDatabase()

  // Get event data to check registration mode
  const [eventRecord] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)

  if (!eventRecord) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  // Check if event uses tickets registration mode
  if (eventRecord.registrationMode !== 'tickets') {
    throw createError({
      statusCode: 400,
      message: 'This event does not use ticket registration. Change the registration mode to "Tickets" in event settings first.',
    })
  }

  // Validate input - include eventId in body for validation
  const result = createTicketTypeSchema.safeParse({ ...body, eventId })
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const data = result.data

  // Create ticket type
  const [newTicketType] = await db
    .insert(ticketTypes)
    .values({
      eventId,
      name: data.name,
      description: data.description,
      price: String(data.price), // Drizzle expects string for decimal
      quantity: data.quantity,
      salesStart: data.salesStart ? new Date(data.salesStart) : null,
      salesEnd: data.salesEnd ? new Date(data.salesEnd) : null,
      maxPerOrder: data.maxPerOrder,
      minPerOrder: data.minPerOrder,
      status: 'active',
      showAvailability: data.showAvailability ?? true,
      showNextTierPrice: data.showNextTierPrice ?? true,
    })
    .returning()

  if (!newTicketType) {
    throw createError({
      statusCode: 500,
      message: 'Failed to create ticket type',
    })
  }

  return successResponse(newTicketType)
})

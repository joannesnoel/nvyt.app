import { ticketTypes, events } from '@nvyt/db'
import { createTicketTypeSchema } from '@nvyt/shared'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const eventId = getRouterParam(event, 'eventId')
  const body = await readBody(event)

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  const db = useDatabase()

  // Verify event exists, user owns it, and ticketing is enabled
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

  if (eventRecord.organizerId !== user.id) {
    throw createError({
      statusCode: 403,
      message: 'You are not authorized to manage this event',
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

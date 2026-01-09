import { ticketTypes, events } from '@nvyt/db'
import { updateTicketTypeSchema } from '@nvyt/shared'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const eventId = getRouterParam(event, 'eventId')
  const ticketTypeId = getRouterParam(event, 'ticketTypeId')
  const body = await readBody(event)

  if (!eventId || !ticketTypeId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID and Ticket Type ID are required',
    })
  }

  const db = useDatabase()

  // Verify event exists and user owns it
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

  // Verify ticket type exists
  const [existingTicketType] = await db
    .select()
    .from(ticketTypes)
    .where(and(eq(ticketTypes.id, ticketTypeId), eq(ticketTypes.eventId, eventId)))
    .limit(1)

  if (!existingTicketType) {
    throw createError({
      statusCode: 404,
      message: 'Ticket type not found',
    })
  }

  // Validate input
  const result = updateTicketTypeSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const data = result.data

  // Prevent reducing quantity below already sold
  if (data.quantity !== undefined && data.quantity < existingTicketType.quantitySold) {
    throw createError({
      statusCode: 400,
      message: `Cannot reduce quantity below already sold amount (${existingTicketType.quantitySold})`,
    })
  }

  // Build update object
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  }

  if (data.name !== undefined) updateData.name = data.name
  if (data.description !== undefined) updateData.description = data.description
  if (data.price !== undefined) updateData.price = String(data.price)
  if (data.quantity !== undefined) updateData.quantity = data.quantity
  if (data.salesStart !== undefined) updateData.salesStart = data.salesStart ? new Date(data.salesStart) : null
  if (data.salesEnd !== undefined) updateData.salesEnd = data.salesEnd ? new Date(data.salesEnd) : null
  if (data.maxPerOrder !== undefined) updateData.maxPerOrder = data.maxPerOrder
  if (data.minPerOrder !== undefined) updateData.minPerOrder = data.minPerOrder

  // Update ticket type
  const [updatedTicketType] = await db
    .update(ticketTypes)
    .set(updateData)
    .where(eq(ticketTypes.id, ticketTypeId))
    .returning()

  return successResponse(updatedTicketType)
})

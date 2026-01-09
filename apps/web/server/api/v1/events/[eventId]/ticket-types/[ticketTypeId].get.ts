import { ticketTypes, events } from '@nvyt/db'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const ticketTypeId = getRouterParam(event, 'ticketTypeId')

  if (!eventId || !ticketTypeId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID and Ticket Type ID are required',
    })
  }

  const db = useDatabase()

  // Verify event exists
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

  // Get ticket type
  const [ticketType] = await db
    .select()
    .from(ticketTypes)
    .where(and(eq(ticketTypes.id, ticketTypeId), eq(ticketTypes.eventId, eventId)))
    .limit(1)

  if (!ticketType) {
    throw createError({
      statusCode: 404,
      message: 'Ticket type not found',
    })
  }

  // Calculate availability
  const available = ticketType.quantity ? ticketType.quantity - ticketType.quantitySold : null
  const isSoldOut = ticketType.quantity ? ticketType.quantitySold >= ticketType.quantity : false
  const now = new Date()
  const isOnSale =
    (!ticketType.salesStart || new Date(ticketType.salesStart) <= now) &&
    (!ticketType.salesEnd || new Date(ticketType.salesEnd) >= now)

  return successResponse({
    ...ticketType,
    available,
    isSoldOut: isSoldOut || ticketType.status === 'sold_out',
    isOnSale: isOnSale && ticketType.status === 'active',
  })
})

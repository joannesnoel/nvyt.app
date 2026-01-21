import { ticketTypes, ticketPriceTiers } from '@nvyt/db'
import { eq, asc } from 'drizzle-orm'

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

  // Verify ticket type exists and belongs to this event
  const [ticketType] = await db
    .select()
    .from(ticketTypes)
    .where(eq(ticketTypes.id, ticketTypeId))
    .limit(1)

  if (!ticketType || ticketType.eventId !== eventId) {
    throw createError({
      statusCode: 404,
      message: 'Ticket type not found',
    })
  }

  // Get all price tiers for this ticket type
  const tiers = await db
    .select()
    .from(ticketPriceTiers)
    .where(eq(ticketPriceTiers.ticketTypeId, ticketTypeId))
    .orderBy(asc(ticketPriceTiers.sortOrder), asc(ticketPriceTiers.startDate))

  return successResponse(tiers)
})

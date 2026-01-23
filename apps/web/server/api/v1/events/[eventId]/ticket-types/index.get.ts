import { ticketTypes, events } from '@nvyt/db'
import { eq, asc } from 'drizzle-orm'
import { hasActiveTier } from '~/server/utils/pricing'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  const db = useDatabase()

  // Verify event exists and has ticketing enabled
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
    // Return empty array instead of error for non-ticket events
    return successResponse([])
  }

  // Get all ticket types for this event
  const types = await db
    .select()
    .from(ticketTypes)
    .where(eq(ticketTypes.eventId, eventId))
    .orderBy(asc(ticketTypes.sortOrder), asc(ticketTypes.createdAt))

  // Calculate availability for each ticket type
  const now = new Date()
  const ticketTypesWithAvailability = await Promise.all(
    types.map(async (type) => {
      const available = type.quantity ? type.quantity - type.quantitySold : null
      const isSoldOut = type.quantity ? type.quantitySold >= type.quantity : false
      const ticketTypeInSalesPeriod =
        (!type.salesStart || new Date(type.salesStart) <= now) &&
        (!type.salesEnd || new Date(type.salesEnd) >= now)

      // Allow sales if ticket type is in sales period OR if an active tier exists
      const hasActivePriceTier = ticketTypeInSalesPeriod ? false : await hasActiveTier(type.id, now)
      const isOnSale = ticketTypeInSalesPeriod || hasActivePriceTier

      return {
        ...type,
        available,
        isSoldOut: isSoldOut || type.status === 'sold_out',
        isOnSale: isOnSale && type.status === 'active',
      }
    })
  )

  return successResponse(ticketTypesWithAvailability)
})

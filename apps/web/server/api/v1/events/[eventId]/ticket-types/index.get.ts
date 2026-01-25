import { ticketTypes, events, ticketPriceTiers } from '@nvyt/db'
import { eq, asc, sql } from 'drizzle-orm'
import { hasActiveTier, getNextSaleInfo } from '~/server/utils/pricing'

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

  // Get tier counts for all ticket types in one query
  let tierCountMap = new Map<string, number>()
  if (types.length > 0) {
    const tierCounts = await db
      .select({
        ticketTypeId: ticketPriceTiers.ticketTypeId,
        count: sql<number>`count(*)::int`,
      })
      .from(ticketPriceTiers)
      .where(sql`${ticketPriceTiers.ticketTypeId} IN (${sql.join(types.map(t => sql`${t.id}`), sql`, `)})`)
      .groupBy(ticketPriceTiers.ticketTypeId)

    tierCountMap = new Map(tierCounts.map(tc => [tc.ticketTypeId, tc.count]))
  }

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
      const isOnSale = (ticketTypeInSalesPeriod || hasActivePriceTier) && type.status === 'active'

      // Get next sale info if not currently on sale
      let nextSaleStart: string | null = null
      let nextSaleTierName: string | null = null
      if (!isOnSale && type.status === 'active' && !isSoldOut) {
        const nextSale = await getNextSaleInfo(type.id, type.salesStart, now)
        if (nextSale) {
          nextSaleStart = nextSale.startsAt.toISOString()
          nextSaleTierName = nextSale.tierName
        }
      }

      return {
        ...type,
        available,
        isSoldOut: isSoldOut || type.status === 'sold_out',
        isOnSale,
        nextSaleStart,
        nextSaleTierName,
        tierCount: tierCountMap.get(type.id) ?? 0,
      }
    })
  )

  return successResponse(ticketTypesWithAvailability)
})

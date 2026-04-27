import { eq, and, gte, lte, ilike, sql, asc, desc, inArray } from 'drizzle-orm'
import { events, users, ticketTypes, ticketPriceTiers } from '@nvyt/db'
import { eventFiltersSchema } from '@nvyt/shared'
import { computeEventStatus, type TicketTypeWithTiers } from '~/server/utils/eventStatus'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  // Validate filters
  const result = eventFiltersSchema.safeParse(query)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Invalid query parameters',
      data: result.error.flatten(),
    })
  }

  const { visibility, status, startAfter, startBefore, search, page, limit } = result.data
  const db = useDatabase()
  const offset = (page - 1) * limit

  // Build conditions
  const conditions = [
    eq(events.visibility, 'public'), // Only show public events by default
    eq(events.status, 'published'),
  ]

  if (visibility) {
    conditions[0] = eq(events.visibility, visibility)
  }

  if (status) {
    conditions[1] = eq(events.status, status)
  }

  if (startAfter) {
    conditions.push(gte(events.startDate, new Date(startAfter)))
  }

  if (startBefore) {
    conditions.push(lte(events.startDate, new Date(startBefore)))
  }

  if (search) {
    conditions.push(
      sql`(${ilike(events.title, `%${search}%`)} OR ${ilike(events.description, `%${search}%`)})`
    )
  }

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(events)
    .where(and(...conditions))
  const count = countResult[0]?.count ?? 0

  // Get events with organizer info
  const eventsList = await db
    .select({
      id: events.id,
      title: events.title,
      slug: events.slug,
      description: events.description,
      coverImage: events.coverImage,
      promoVideoUrl: events.promoVideoUrl,
      thumbnailImage: events.thumbnailImage,
      startDate: events.startDate,
      endDate: events.endDate,
      location: events.location,
      locationDetails: events.locationDetails,
      visibility: events.visibility,
      status: events.status,
      registrationMode: events.registrationMode,
      maxAttendees: events.maxAttendees,
      ticketingEnabled: events.ticketingEnabled,
      contributionsEnabled: events.contributionsEnabled,
      organizer: {
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(events)
    .leftJoin(users, eq(events.organizerId, users.id))
    .where(and(...conditions))
    // Upcoming events first (sorted by nearest start), then ended events (most recent first).
    // Ties on start date are broken alphabetically by title.
    .orderBy(
      sql`(COALESCE(${events.endDate}, ${events.startDate}) < NOW())`,
      sql`CASE WHEN COALESCE(${events.endDate}, ${events.startDate}) >= NOW() THEN ${events.startDate} END ASC NULLS LAST`,
      desc(events.startDate),
      asc(events.title),
    )
    .limit(limit)
    .offset(offset)

  // Batch-load ticket types + price tiers for ticketed events to compute status
  const ticketedEventIds = eventsList
    .filter(e => e.registrationMode === 'tickets')
    .map(e => e.id)

  const ticketTypesByEvent = new Map<string, TicketTypeWithTiers[]>()

  if (ticketedEventIds.length > 0) {
    const allTicketTypes = await db
      .select()
      .from(ticketTypes)
      .where(inArray(ticketTypes.eventId, ticketedEventIds))

    const ticketTypeIds = allTicketTypes.map(t => t.id)
    const allTiers = ticketTypeIds.length > 0
      ? await db
          .select()
          .from(ticketPriceTiers)
          .where(inArray(ticketPriceTiers.ticketTypeId, ticketTypeIds))
      : []

    const tiersByTicketType = new Map<string, typeof allTiers>()
    for (const tier of allTiers) {
      const list = tiersByTicketType.get(tier.ticketTypeId) ?? []
      list.push(tier)
      tiersByTicketType.set(tier.ticketTypeId, list)
    }

    for (const tt of allTicketTypes) {
      const list = ticketTypesByEvent.get(tt.eventId) ?? []
      list.push({
        ...tt,
        priceTiers: tiersByTicketType.get(tt.id) ?? [],
      })
      ticketTypesByEvent.set(tt.eventId, list)
    }
  }

  const now = new Date()
  const enriched = eventsList.map(e => ({
    ...e,
    status: computeEventStatus(
      {
        status: e.status,
        startDate: e.startDate,
        endDate: e.endDate,
        registrationMode: e.registrationMode,
      },
      ticketTypesByEvent.get(e.id) ?? [],
      now,
    ),
  }))

  return paginatedResponse(enriched, page, limit, Number(count))
})

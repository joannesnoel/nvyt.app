import { eq, and, gte, lte, ilike, sql, desc } from 'drizzle-orm'
import { events, users } from '@nvyt/db'
import { eventFiltersSchema } from '@nvyt/shared'

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
    .orderBy(desc(events.startDate))
    .limit(limit)
    .offset(offset)

  return paginatedResponse(eventsList, page, limit, Number(count))
})

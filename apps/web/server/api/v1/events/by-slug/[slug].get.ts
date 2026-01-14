import { eq, and, sql } from 'drizzle-orm'
import { events, users, ticketTypes, attendees, contributionItems } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  const inviteToken = getQuery(event).token as string | undefined

  console.log('[API] Fetching event by slug:', slug)

  if (!slug) {
    throw createError({
      statusCode: 400,
      message: 'Event slug is required',
    })
  }

  let db
  try {
    db = useDatabase()
  } catch (err) {
    console.error('[API] Database connection error:', err)
    throw createError({
      statusCode: 500,
      message: 'Database connection failed',
    })
  }

  const currentUser = await getUserFromEvent(event)

  // Get event with organizer
  const [eventData] = await db
    .select({
      id: events.id,
      title: events.title,
      slug: events.slug,
      description: events.description,
      coverImage: events.coverImage,
      startDate: events.startDate,
      endDate: events.endDate,
      timezone: events.timezone,
      location: events.location,
      locationDetails: events.locationDetails,
      visibility: events.visibility,
      status: events.status,
      registrationMode: events.registrationMode,
      maxAttendees: events.maxAttendees,
      requiresApproval: events.requiresApproval,
      ticketingEnabled: events.ticketingEnabled,
      contributionsEnabled: events.contributionsEnabled,
      inviteToken: events.inviteToken,
      organizerId: events.organizerId,
      createdAt: events.createdAt,
      organizer: {
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(events)
    .leftJoin(users, eq(events.organizerId, users.id))
    .where(eq(events.slug, slug))
    .limit(1)

  if (!eventData) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  // Check access for private events
  const isOrganizer = currentUser?.id === eventData.organizerId
  const hasInviteToken = inviteToken && inviteToken === eventData.inviteToken

  if (eventData.visibility === 'private' && !isOrganizer && !hasInviteToken) {
    throw createError({
      statusCode: 403,
      message: 'This event is private',
    })
  }

  // Get ticket types if registration mode is 'tickets'
  let tickets: typeof ticketTypes.$inferSelect[] = []
  if (eventData.registrationMode === 'tickets') {
    const now = new Date()

    if (isOrganizer) {
      // Organizers see all tickets for management
      tickets = await db
        .select()
        .from(ticketTypes)
        .where(eq(ticketTypes.eventId, eventData.id))
        .orderBy(ticketTypes.sortOrder)
    } else {
      // Public users only see active tickets within sales period
      const nowIso = now.toISOString()
      tickets = await db
        .select()
        .from(ticketTypes)
        .where(
          and(
            eq(ticketTypes.eventId, eventData.id),
            eq(ticketTypes.status, 'active'),
            // Sales must have started (or no start date set)
            sql`(${ticketTypes.salesStart} IS NULL OR ${ticketTypes.salesStart} <= ${nowIso}::timestamptz)`,
            // Sales must not have ended (or no end date set)
            sql`(${ticketTypes.salesEnd} IS NULL OR ${ticketTypes.salesEnd} >= ${nowIso}::timestamptz)`
          )
        )
        .orderBy(ticketTypes.sortOrder)
    }
  }

  // Get contribution items if enabled
  let contributions: typeof contributionItems.$inferSelect[] = []
  if (eventData.contributionsEnabled) {
    contributions = await db
      .select()
      .from(contributionItems)
      .where(eq(contributionItems.eventId, eventData.id))
      .orderBy(contributionItems.sortOrder)
  }

  // Get attendee count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(attendees)
    .where(
      and(
        eq(attendees.eventId, eventData.id),
        eq(attendees.status, 'confirmed')
      )
    )
  const attendeeCount = Number(countResult[0]?.count ?? 0)

  // Check if current user is attending
  let userAttendee = null
  if (currentUser) {
    const [attendance] = await db
      .select()
      .from(attendees)
      .where(
        and(
          eq(attendees.eventId, eventData.id),
          eq(attendees.userId, currentUser.id)
        )
      )
      .limit(1)
    userAttendee = attendance ?? null
  }

  // Remove sensitive data
  const { inviteToken: _, ...safeEventData } = eventData

  return successResponse({
    ...safeEventData,
    ticketTypes: tickets,
    contributionItems: contributions,
    attendeeCount: Number(attendeeCount),
    userAttendee,
    isOrganizer,
  })
})

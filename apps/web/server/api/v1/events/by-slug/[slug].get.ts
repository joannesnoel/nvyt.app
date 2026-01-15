import { eq, and, sql, asc, desc } from 'drizzle-orm'
import { events, users, ticketTypes, tickets, attendees, contributionItems, eventRequirements, eventFaqs, eventAnnouncements } from '@nvyt/db'

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
      promoVideoUrl: events.promoVideoUrl,
      mediaType: events.mediaType,
      organizationName: events.organizationName,
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
  let ticketTypesData: typeof ticketTypes.$inferSelect[] = []
  if (eventData.registrationMode === 'tickets') {
    const now = new Date()

    if (isOrganizer) {
      // Organizers see all tickets for management
      ticketTypesData = await db
        .select()
        .from(ticketTypes)
        .where(eq(ticketTypes.eventId, eventData.id))
        .orderBy(ticketTypes.sortOrder)
    } else {
      // Public users only see active tickets within sales period
      const nowIso = now.toISOString()
      ticketTypesData = await db
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

  // Get active requirements for checkout display (tickets mode only)
  let requirements: typeof eventRequirements.$inferSelect[] = []
  if (eventData.registrationMode === 'tickets') {
    requirements = await db
      .select()
      .from(eventRequirements)
      .where(
        and(
          eq(eventRequirements.eventId, eventData.id),
          eq(eventRequirements.isActive, true)
        )
      )
      .orderBy(asc(eventRequirements.sortOrder), asc(eventRequirements.createdAt))
  }

  // Get active FAQs for event page
  const faqs = await db
    .select()
    .from(eventFaqs)
    .where(
      and(
        eq(eventFaqs.eventId, eventData.id),
        eq(eventFaqs.isActive, true)
      )
    )
    .orderBy(asc(eventFaqs.sortOrder), asc(eventFaqs.createdAt))

  // Get published announcements for event page (pinned first, then newest)
  const announcements = await db
    .select()
    .from(eventAnnouncements)
    .where(
      and(
        eq(eventAnnouncements.eventId, eventData.id),
        eq(eventAnnouncements.isPublished, true)
      )
    )
    .orderBy(desc(eventAnnouncements.isPinned), desc(eventAnnouncements.createdAt))

  // Get attendee count (for RSVP events)
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

  // Get confirmed ticket count (for ticket-based events)
  let ticketCount = 0
  if (eventData.registrationMode === 'tickets') {
    const [ticketCountResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tickets)
      .where(
        and(
          eq(tickets.eventId, eventData.id),
          eq(tickets.status, 'confirmed')
        )
      )
    ticketCount = Number(ticketCountResult?.count ?? 0)
  }

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

  // Ensure all data is plain objects (no Drizzle internal references)
  return successResponse({
    ...safeEventData,
    ticketTypes: ticketTypesData.map(t => ({ ...t })),
    contributionItems: contributions.map(c => ({ ...c })),
    requirements: requirements.map(r => ({ ...r })),
    faqs: faqs.map(f => ({ ...f })),
    announcements: announcements.map(a => ({ ...a })),
    attendeeCount: Number(attendeeCount),
    ticketCount,
    userAttendee: userAttendee ? { ...userAttendee } : null,
    isOrganizer,
  })
})

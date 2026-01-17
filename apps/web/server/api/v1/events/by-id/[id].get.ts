import { eq, and, sql } from 'drizzle-orm'
import { events, users, ticketTypes, attendees, contributionItems } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'id')

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  const db = useDatabase()
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
      theme: events.theme,
      colorTemplate: events.colorTemplate,
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
    .where(eq(events.id, eventId))
    .limit(1)

  if (!eventData) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  // Check access - must be organizer or event must be public/have invite token
  const isOrganizer = currentUser?.id === eventData.organizerId

  if (!isOrganizer && eventData.visibility === 'private') {
    throw createError({
      statusCode: 403,
      message: 'You do not have access to this event',
    })
  }

  // Get ticket types if registration mode is 'tickets'
  let tickets: typeof ticketTypes.$inferSelect[] = []
  if (eventData.registrationMode === 'tickets') {
    tickets = await db
      .select()
      .from(ticketTypes)
      .where(eq(ticketTypes.eventId, eventData.id))
      .orderBy(ticketTypes.sortOrder)
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

  // Include invite token only for organizer
  const responseData = {
    ...eventData,
    inviteToken: isOrganizer ? eventData.inviteToken : undefined,
    ticketTypes: tickets,
    contributionItems: contributions,
    attendeeCount,
    userAttendee,
    isOrganizer,
  }

  return successResponse(responseData)
})

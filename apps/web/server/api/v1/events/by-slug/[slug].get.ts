import { eq, and, sql, asc, desc } from 'drizzle-orm'
import { events, users, ticketTypes, tickets, attendees, contributionItems, eventRequirements, eventFaqs, eventAnnouncements, eventVerifications, ticketPriceTiers } from '@nvyt/db'
import { getActivePrice, getPriceTiers, hasActiveTier } from '~/server/utils/pricing'

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
      theme: events.theme,
      colorTemplate: events.colorTemplate,
      titleFontFamily: events.titleFontFamily,
      fontFamily: events.fontFamily,
      bodyFontFamily: events.bodyFontFamily,
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
      // Public users see all active tickets (sales window checked on frontend for display)
      ticketTypesData = await db
        .select()
        .from(ticketTypes)
        .where(
          and(
            eq(ticketTypes.eventId, eventData.id),
            eq(ticketTypes.status, 'active')
          )
        )
        .orderBy(ticketTypes.sortOrder)
    }
  }

  // Get admin fee rate from event verification (for paid ticket events)
  let adminFeeRate = 0
  if (eventData.registrationMode === 'tickets') {
    const [verification] = await db
      .select({ adminFeeRate: eventVerifications.adminFeeRate })
      .from(eventVerifications)
      .where(eq(eventVerifications.eventId, eventData.id))
      .limit(1)

    adminFeeRate = verification?.adminFeeRate ? parseFloat(verification.adminFeeRate) : 0
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

  // Fetch price tiers and active prices for ticket types
  const now = new Date()
  const ticketTypesWithPricing = await Promise.all(
    ticketTypesData.map(async (t) => {
      // Get all price tiers for this ticket type
      const priceTiers = await getPriceTiers(t.id)

      // Get active price info
      const activePriceInfo = await getActivePrice(t.id, t.price, now)

      // Compute availability (same logic as dashboard API)
      const available = t.quantity ? t.quantity - t.quantitySold : null
      const isSoldOut = (t.quantity ? t.quantitySold >= t.quantity : false) || t.status === 'sold_out'

      // Check if ticket type is within its sales period
      const ticketTypeInSalesPeriod =
        (!t.salesStart || new Date(t.salesStart) <= now) &&
        (!t.salesEnd || new Date(t.salesEnd) >= now)

      // Allow sales if ticket type is in sales period OR if an active tier exists
      const hasActivePriceTier = ticketTypeInSalesPeriod ? false : await hasActiveTier(t.id, now)
      const isOnSale = (ticketTypeInSalesPeriod || hasActivePriceTier) && t.status === 'active' && !isSoldOut

      return {
        ...t,
        priceTiers: priceTiers.map(tier => ({ ...tier })),
        activePrice: activePriceInfo.price,
        activeTierName: activePriceInfo.tierName,
        activeTierId: activePriceInfo.tierId,
        activeTierType: activePriceInfo.tierType,
        isBaseTier: activePriceInfo.isBaseTier,
        tierQuantityRemaining: activePriceInfo.quantityRemaining,
        nextTier: activePriceInfo.nextTier
          ? {
              name: activePriceInfo.nextTier.name,
              price: activePriceInfo.nextTier.price,
              startsAt: activePriceInfo.nextTier.startsAt?.toISOString(),
              afterQuantity: activePriceInfo.nextTier.afterQuantity,
            }
          : null,
        // Computed availability fields (same as dashboard API)
        available,
        isSoldOut,
        isOnSale,
      }
    })
  )

  // Ensure all data is plain objects (no Drizzle internal references)
  return successResponse({
    ...safeEventData,
    ticketTypes: ticketTypesWithPricing,
    contributionItems: contributions.map(c => ({ ...c })),
    requirements: requirements.map(r => ({ ...r })),
    faqs: faqs.map(f => ({ ...f })),
    announcements: announcements.map(a => ({ ...a })),
    attendeeCount: Number(attendeeCount),
    ticketCount,
    userAttendee: userAttendee ? { ...userAttendee } : null,
    isOrganizer,
    adminFeeRate, // Fee rate for ticket purchases (0-1)
  })
})

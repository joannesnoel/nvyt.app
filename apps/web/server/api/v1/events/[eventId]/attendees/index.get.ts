import { eq, and, or, ilike, sql, desc, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { events, attendees, users, tickets, ticketTypes, orders } from '@nvyt/db'
import { attendeeFiltersSchema } from '@nvyt/shared'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const query = getQuery(event)

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  // Require canManageAttendees or canViewTickets permission (owner or collaborator)
  const access = await requireEventAccess(event, eventId)
  if (!access.isOwner && !access.permissions.canManageAttendees && !access.permissions.canViewTickets) {
    throw createError({
      statusCode: 403,
      message: 'You do not have permission to view attendees',
    })
  }

  // Validate filters
  const result = attendeeFiltersSchema.safeParse(query)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Invalid query parameters',
      data: result.error.flatten(),
    })
  }

  const { status, search, page, limit } = result.data
  const db = useDatabase()
  const offset = (page - 1) * limit

  // Get event to check registration mode
  const [eventData] = await db
    .select({ registrationMode: events.registrationMode })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)

  if (!eventData) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  // Handle ticket-based events differently
  if (eventData.registrationMode === 'tickets') {
    return await getTicketStats(db, eventId, { status, search, page, limit, offset })
  }

  // RSVP mode: Use attendees table
  // Build conditions (search is applied in SQL so pagination + total reflect it)
  const conditions = [eq(attendees.eventId, eventId)]

  if (status) {
    conditions.push(eq(attendees.status, status))
  }

  if (search) {
    const s = `%${search}%`
    conditions.push(
      or(ilike(users.name, s), ilike(users.email, s))!,
    )
  }

  // Get total count (must mirror the same joins so search conditions resolve)
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(attendees)
    .leftJoin(users, eq(attendees.userId, users.id))
    .where(and(...conditions))

  const total = Number(countResult[0]?.count ?? 0)

  // Get paginated attendees with user info
  const attendeesList = await db
    .select({
      id: attendees.id,
      status: attendees.status,
      qrCode: attendees.qrCode,
      notes: attendees.notes,
      respondedAt: attendees.respondedAt,
      checkedInAt: attendees.checkedInAt,
      createdAt: attendees.createdAt,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(attendees)
    .leftJoin(users, eq(attendees.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(attendees.createdAt))
    .limit(limit)
    .offset(offset)

  // Get stats for RSVP mode
  const statsResult = await db
    .select({
      status: attendees.status,
      count: sql<number>`count(*)`,
    })
    .from(attendees)
    .where(eq(attendees.eventId, eventId))
    .groupBy(attendees.status)

  const stats = {
    total: 0,
    confirmed: 0,
    pending: 0,
    waitlisted: 0,
    declined: 0,
    cancelled: 0,
    checkedIn: 0,
  }

  for (const row of statsResult) {
    const count = Number(row.count)
    stats.total += count
    if (row.status === 'confirmed') stats.confirmed = count
    if (row.status === 'pending') stats.pending = count
    if (row.status === 'waitlisted') stats.waitlisted = count
    if (row.status === 'declined') stats.declined = count
    if (row.status === 'cancelled') stats.cancelled = count
  }

  // Get checked-in count for RSVP
  const checkedInResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(attendees)
    .where(
      and(
        eq(attendees.eventId, eventId),
        sql`${attendees.checkedInAt} IS NOT NULL`
      )
    )

  stats.checkedIn = Number(checkedInResult[0]?.count ?? 0)

  return successResponse({
    attendees: attendeesList,
    stats,
  }, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  })
})

// Helper function to get stats for ticket-based events
async function getTicketStats(
  db: ReturnType<typeof useDatabase>,
  eventId: string,
  options: { status?: string; search?: string; page: number; limit: number; offset: number }
) {
  const { status, search, page, limit, offset } = options

  // Aliased user table for the attendee's user record (separate from the purchaser join)
  const attendeeUsers = alias(users, 'attendee_users')

  // Build conditions for tickets (only from paid/pending orders)
  const conditions = [
    eq(tickets.eventId, eventId),
    inArray(orders.paymentStatus, ['paid', 'pending']),
  ]

  // Map attendee status filter to ticket status
  if (status) {
    if (status === 'confirmed') {
      // Show both confirmed and checked_in as "confirmed" attendees
      conditions.push(inArray(tickets.status, ['confirmed', 'checked_in']))
    } else if (status === 'pending') {
      conditions.push(eq(tickets.status, 'pending'))
    } else if (status === 'cancelled') {
      conditions.push(inArray(tickets.status, ['cancelled', 'refunded']))
    }
    // Note: waitlisted and declined don't apply to tickets
  }

  // Push search into SQL so pagination + total reflect filtered results
  if (search) {
    const s = `%${search}%`
    conditions.push(
      or(
        ilike(tickets.attendeeName, s),
        ilike(tickets.ticketNumber, s),
        ilike(orders.customerName, s),
        ilike(orders.customerEmail, s),
        ilike(users.name, s),
        ilike(users.email, s),
        ilike(attendeeUsers.name, s),
        ilike(attendeeUsers.email, s),
      )!,
    )
  }

  // Get tickets with user, attendee user, ticket type, and order customer info
  const ticketsList = await db
    .select({
      id: tickets.id,
      status: tickets.status,
      qrCode: tickets.qrCode,
      ticketNumber: tickets.ticketNumber,
      attendeeName: tickets.attendeeName,
      attendeeUserId: tickets.attendeeUserId,
      checkedInAt: tickets.checkedInAt,
      createdAt: tickets.createdAt,
      ticketType: {
        id: ticketTypes.id,
        name: ticketTypes.name,
      },
      // Purchaser user record
      purchaser: {
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
      },
      // Attendee user record (may differ from purchaser when ticket transferred)
      attendeeUser: {
        id: attendeeUsers.id,
        name: attendeeUsers.name,
        email: attendeeUsers.email,
        avatarUrl: attendeeUsers.avatarUrl,
      },
      // Order customer info (from checkout form - more accurate than user record)
      customer: {
        name: orders.customerName,
        email: orders.customerEmail,
      },
    })
    .from(tickets)
    .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
    .innerJoin(orders, eq(tickets.orderId, orders.id))
    .leftJoin(users, eq(tickets.userId, users.id))
    .leftJoin(attendeeUsers, eq(tickets.attendeeUserId, attendeeUsers.id))
    .where(and(...conditions))
    .orderBy(desc(tickets.createdAt))
    .limit(limit)
    .offset(offset)

  // Get total count (mirror the same joins so search/where conditions resolve)
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(tickets)
    .innerJoin(orders, eq(tickets.orderId, orders.id))
    .leftJoin(users, eq(tickets.userId, users.id))
    .leftJoin(attendeeUsers, eq(tickets.attendeeUserId, attendeeUsers.id))
    .where(and(...conditions))

  const total = Number(countResult[0]?.count ?? 0)

  const filteredList = ticketsList

  // Get stats for tickets (only from paid/pending orders)
  const statsResult = await db
    .select({
      status: tickets.status,
      count: sql<number>`count(*)`,
    })
    .from(tickets)
    .innerJoin(orders, eq(tickets.orderId, orders.id))
    .where(and(eq(tickets.eventId, eventId), inArray(orders.paymentStatus, ['paid', 'pending'])))
    .groupBy(tickets.status)

  const stats = {
    total: 0,
    confirmed: 0,
    pending: 0,
    waitlisted: 0, // Not applicable for tickets
    declined: 0,   // Not applicable for tickets
    cancelled: 0,
    checkedIn: 0,
  }

  for (const row of statsResult) {
    const count = Number(row.count)
    stats.total += count
    // For tickets: confirmed = confirmed tickets (not yet checked in)
    if (row.status === 'confirmed') stats.confirmed = count
    // For tickets: checked_in is a separate status
    if (row.status === 'checked_in') stats.checkedIn = count
    if (row.status === 'pending') stats.pending = count
    if (row.status === 'cancelled' || row.status === 'refunded') {
      stats.cancelled += count
    }
  }

  // Transform tickets to attendee-like format for frontend compatibility
  // Priority: attendeeName > attendeeUserId user > order customer > purchaser user
  const attendeesList = filteredList.map(t => {
    const attendeeUser = t.attendeeUserId ? t.attendeeUser : null

    return {
      id: t.id,
      status: t.status === 'checked_in' ? 'checked_in' : t.status,
      qrCode: t.qrCode,
      notes: null,
      respondedAt: t.createdAt,
      checkedInAt: t.checkedInAt,
      createdAt: t.createdAt,
      ticketNumber: t.ticketNumber,
      ticketType: t.ticketType,
      user: {
        id: attendeeUser?.id ?? t.purchaser?.id ?? null,
        name: t.attendeeName || attendeeUser?.name || t.customer?.name || t.purchaser?.name || null,
        email: attendeeUser?.email || t.customer?.email || t.purchaser?.email || null,
        avatarUrl: attendeeUser?.avatarUrl ?? t.purchaser?.avatarUrl ?? null,
      },
      purchasedBy: {
        name: t.customer?.name || t.purchaser?.name || null,
        email: t.customer?.email || t.purchaser?.email || null,
      },
    }
  })

  // Get per-ticket-type stats (only non-cancelled/non-refunded from paid/pending orders)
  const ticketTypeStatsResult = await db
    .select({
      id: ticketTypes.id,
      name: ticketTypes.name,
      quantity: ticketTypes.quantity,
      sold: sql<number>`count(${tickets.id})`,
    })
    .from(ticketTypes)
    .leftJoin(
      tickets,
      and(
        eq(tickets.ticketTypeId, ticketTypes.id),
        inArray(tickets.status, ['confirmed', 'checked_in', 'pending']),
      )
    )
    .leftJoin(orders, eq(tickets.orderId, orders.id))
    .where(
      and(
        eq(ticketTypes.eventId, eventId),
        sql`(${orders.paymentStatus} IN ('paid', 'pending') OR ${orders.paymentStatus} IS NULL)`,
      )
    )
    .groupBy(ticketTypes.id, ticketTypes.name, ticketTypes.quantity, ticketTypes.sortOrder)
    .orderBy(ticketTypes.sortOrder)

  const ticketTypeStats = ticketTypeStatsResult.map(row => ({
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    sold: Number(row.sold),
  }))

  return successResponse({
    attendees: attendeesList,
    stats,
    ticketTypeStats,
  }, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  })
}

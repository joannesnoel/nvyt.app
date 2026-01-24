import { eq, and, ilike, sql, desc, inArray } from 'drizzle-orm'
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

  // Require canManageAttendees permission (owner or collaborator)
  await requireEventAccess(event, eventId, 'canManageAttendees')

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
  // Build conditions
  const conditions = [eq(attendees.eventId, eventId)]

  if (status) {
    conditions.push(eq(attendees.status, status))
  }

  // Get attendees with user info
  let attendeeQuery = db
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

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(attendees)
    .where(and(...conditions))

  const total = Number(countResult[0]?.count ?? 0)

  // Get attendees
  let attendeesList = await attendeeQuery

  // Filter by search if provided (search in user name/email)
  if (search) {
    attendeesList = attendeesList.filter(a =>
      a.user?.name?.toLowerCase().includes(search.toLowerCase()) ||
      a.user?.email?.toLowerCase().includes(search.toLowerCase())
    )
  }

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

  // Build conditions for tickets
  const conditions = [eq(tickets.eventId, eventId)]

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

  // Get tickets with user and ticket type info (as "attendees")
  // Join both purchaser (userId) and attendee (attendeeUserId) user records
  const ticketsList = await db
    .select({
      id: tickets.id,
      status: tickets.status,
      qrCode: tickets.qrCode,
      ticketNumber: tickets.ticketNumber,
      attendeeName: tickets.attendeeName,
      attendeeEmail: tickets.attendeeEmail,
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
    })
    .from(tickets)
    .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
    .leftJoin(users, eq(tickets.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(tickets.createdAt))
    .limit(limit)
    .offset(offset)

  // Fetch attendee user records separately for tickets that have attendeeUserId
  const attendeeUserIds = ticketsList
    .map(t => t.attendeeUserId)
    .filter((id): id is string => id !== null)

  const attendeeUsersMap = new Map<string, { id: string; name: string | null; email: string; avatarUrl: string | null }>()

  if (attendeeUserIds.length > 0) {
    const attendeeUsers = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(inArray(users.id, attendeeUserIds))

    for (const user of attendeeUsers) {
      attendeeUsersMap.set(user.id, user)
    }
  }

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(tickets)
    .where(and(...conditions))

  const total = Number(countResult[0]?.count ?? 0)

  // Filter by search if provided
  let filteredList = ticketsList
  if (search) {
    const searchLower = search.toLowerCase()
    filteredList = ticketsList.filter(t => {
      const attendeeUser = t.attendeeUserId ? attendeeUsersMap.get(t.attendeeUserId) : null
      return (
        t.purchaser?.name?.toLowerCase().includes(searchLower) ||
        t.purchaser?.email?.toLowerCase().includes(searchLower) ||
        attendeeUser?.name?.toLowerCase().includes(searchLower) ||
        attendeeUser?.email?.toLowerCase().includes(searchLower) ||
        t.attendeeName?.toLowerCase().includes(searchLower) ||
        t.attendeeEmail?.toLowerCase().includes(searchLower) ||
        t.ticketNumber?.toLowerCase().includes(searchLower)
      )
    })
  }

  // Get stats for tickets
  const statsResult = await db
    .select({
      status: tickets.status,
      count: sql<number>`count(*)`,
    })
    .from(tickets)
    .where(eq(tickets.eventId, eventId))
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
  // Priority: attendeeUserId user > legacy fields > purchaser user
  const attendeesList = filteredList.map(t => {
    const attendeeUser = t.attendeeUserId ? attendeeUsersMap.get(t.attendeeUserId) : null

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
        name: attendeeUser?.name || t.attendeeName || t.purchaser?.name || null,
        email: attendeeUser?.email || t.attendeeEmail || t.purchaser?.email || null,
        avatarUrl: attendeeUser?.avatarUrl ?? t.purchaser?.avatarUrl ?? null,
      },
    }
  })

  return successResponse({
    attendees: attendeesList,
    stats,
  }, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  })
}

import { eq, and, ilike, sql, desc } from 'drizzle-orm'
import { events, attendees, users } from '@nvyt/db'
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

  // Get stats
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

  // Get checked-in count
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

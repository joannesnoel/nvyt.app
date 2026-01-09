import { eq, and } from 'drizzle-orm'
import { events, attendees, users } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const eventId = getRouterParam(event, 'eventId')
  const query = getQuery(event)
  const format = (query.format as string) || 'csv'

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  const db = useDatabase()

  // Verify user is the organizer
  const [eventData] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)

  if (!eventData) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  if (eventData.organizerId !== user.id) {
    throw createError({
      statusCode: 403,
      message: 'Only the organizer can export attendees',
    })
  }

  // Get all attendees
  const attendeesList = await db
    .select({
      name: users.name,
      email: users.email,
      status: attendees.status,
      respondedAt: attendees.respondedAt,
      checkedInAt: attendees.checkedInAt,
      notes: attendees.notes,
    })
    .from(attendees)
    .leftJoin(users, eq(attendees.userId, users.id))
    .where(eq(attendees.eventId, eventId))
    .orderBy(attendees.createdAt)

  if (format === 'json') {
    return successResponse({
      event: {
        title: eventData.title,
        slug: eventData.slug,
        startDate: eventData.startDate,
      },
      attendees: attendeesList,
      exportedAt: new Date().toISOString(),
    })
  }

  // CSV format
  const headers = ['Name', 'Email', 'Status', 'Responded At', 'Checked In At', 'Notes']
  const rows = attendeesList.map(a => [
    a.name || '',
    a.email || '',
    a.status,
    a.respondedAt ? new Date(a.respondedAt).toISOString() : '',
    a.checkedInAt ? new Date(a.checkedInAt).toISOString() : '',
    a.notes || '',
  ])

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ].join('\n')

  // Set headers for file download
  setHeader(event, 'Content-Type', 'text/csv')
  setHeader(event, 'Content-Disposition', `attachment; filename="${eventData.slug}-attendees.csv"`)

  return csv
})

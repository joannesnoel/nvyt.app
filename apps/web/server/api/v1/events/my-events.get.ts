import { eq, desc, sql } from 'drizzle-orm'
import { events, attendees } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const db = useDatabase()

  // Get all events organized by this user
  const myEvents = await db
    .select({
      id: events.id,
      title: events.title,
      slug: events.slug,
      description: events.description,
      coverImage: events.coverImage,
      startDate: events.startDate,
      endDate: events.endDate,
      location: events.location,
      visibility: events.visibility,
      status: events.status,
      registrationMode: events.registrationMode,
      maxAttendees: events.maxAttendees,
      ticketingEnabled: events.ticketingEnabled,
      contributionsEnabled: events.contributionsEnabled,
      createdAt: events.createdAt,
    })
    .from(events)
    .where(eq(events.organizerId, user.id))
    .orderBy(desc(events.createdAt))

  // Get attendee counts for each event
  const eventsWithStats = await Promise.all(
    myEvents.map(async (evt) => {
      const statsResult = await db
        .select({
          status: attendees.status,
          count: sql<number>`count(*)`,
        })
        .from(attendees)
        .where(eq(attendees.eventId, evt.id))
        .groupBy(attendees.status)

      const stats = {
        confirmed: 0,
        pending: 0,
        waitlisted: 0,
        total: 0,
      }

      for (const row of statsResult) {
        const count = Number(row.count)
        stats.total += count
        if (row.status === 'confirmed') stats.confirmed = count
        if (row.status === 'pending') stats.pending = count
        if (row.status === 'waitlisted') stats.waitlisted = count
      }

      return {
        ...evt,
        stats,
      }
    })
  )

  // Calculate totals
  const totals = {
    events: myEvents.length,
    attendees: eventsWithStats.reduce((sum, e) => sum + e.stats.confirmed, 0),
    pending: eventsWithStats.reduce((sum, e) => sum + e.stats.pending, 0),
  }

  return successResponse({
    events: eventsWithStats,
    totals,
  })
})

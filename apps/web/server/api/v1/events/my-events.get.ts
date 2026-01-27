import { eq, desc, sql, and, isNotNull } from 'drizzle-orm'
import { events, attendees, eventCollaborators } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const db = useDatabase()

  // Get all events organized by this user
  const ownedEvents = await db
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

  // Get events where user is a collaborator (with accepted invitation)
  const collaboratorEvents = await db
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
      visibility: events.visibility,
      status: events.status,
      registrationMode: events.registrationMode,
      maxAttendees: events.maxAttendees,
      ticketingEnabled: events.ticketingEnabled,
      contributionsEnabled: events.contributionsEnabled,
      createdAt: events.createdAt,
    })
    .from(events)
    .innerJoin(
      eventCollaborators,
      and(
        eq(eventCollaborators.eventId, events.id),
        eq(eventCollaborators.userId, user.id),
        isNotNull(eventCollaborators.acceptedAt)
      )
    )
    .orderBy(desc(events.createdAt))

  // Combine and dedupe (in case of any overlap)
  const eventIds = new Set<string>()
  const myEvents = []

  for (const evt of ownedEvents) {
    eventIds.add(evt.id)
    myEvents.push({ ...evt, role: 'owner' as const })
  }

  for (const evt of collaboratorEvents) {
    if (!eventIds.has(evt.id)) {
      eventIds.add(evt.id)
      myEvents.push({ ...evt, role: 'collaborator' as const })
    }
  }

  // Sort by createdAt descending
  myEvents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

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

import { eventAnnouncements, events } from '@nvyt/db'
import { eq, and, desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  const db = useDatabase()
  const currentUser = await getUserFromEvent(event)

  // Verify event exists
  const [eventRecord] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)

  if (!eventRecord) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  const isOrganizer = currentUser?.id === eventRecord.organizerId

  // Build query - organizers see all, public sees only published
  // Order: pinned first, then by creation date (newest first)
  let announcements
  if (isOrganizer) {
    announcements = await db
      .select()
      .from(eventAnnouncements)
      .where(eq(eventAnnouncements.eventId, eventId))
      .orderBy(desc(eventAnnouncements.isPinned), desc(eventAnnouncements.createdAt))
  } else {
    announcements = await db
      .select()
      .from(eventAnnouncements)
      .where(
        and(
          eq(eventAnnouncements.eventId, eventId),
          eq(eventAnnouncements.isPublished, true)
        )
      )
      .orderBy(desc(eventAnnouncements.isPinned), desc(eventAnnouncements.createdAt))
  }

  return successResponse(announcements)
})

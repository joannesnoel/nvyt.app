import { eventAnnouncements } from '@nvyt/db'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const announcementId = getRouterParam(event, 'announcementId')

  if (!eventId || !announcementId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID and Announcement ID are required',
    })
  }

  // Require canEdit permission
  await requireEventAccess(event, eventId, 'canEdit')

  const db = useDatabase()

  // Check announcement exists and belongs to this event
  const [existingAnnouncement] = await db
    .select()
    .from(eventAnnouncements)
    .where(
      and(
        eq(eventAnnouncements.id, announcementId),
        eq(eventAnnouncements.eventId, eventId)
      )
    )
    .limit(1)

  if (!existingAnnouncement) {
    throw createError({
      statusCode: 404,
      message: 'Announcement not found',
    })
  }

  // Delete announcement
  await db
    .delete(eventAnnouncements)
    .where(eq(eventAnnouncements.id, announcementId))

  return successResponse({ deleted: true })
})

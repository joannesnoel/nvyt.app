import { eventAnnouncements } from '@nvyt/db'
import { updateEventAnnouncementSchema } from '@nvyt/shared'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const announcementId = getRouterParam(event, 'announcementId')
  const body = await readBody(event)

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

  // Validate input
  const result = updateEventAnnouncementSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const data = result.data

  // Build update object
  const updateData: Record<string, any> = {
    updatedAt: new Date(),
  }

  if (data.title !== undefined) {
    updateData.title = data.title
  }
  if (data.content !== undefined) {
    updateData.content = data.content
  }
  if (data.isPinned !== undefined) {
    updateData.isPinned = data.isPinned
  }
  if (data.isPublished !== undefined) {
    updateData.isPublished = data.isPublished
  }

  // Update announcement
  const [updatedAnnouncement] = await db
    .update(eventAnnouncements)
    .set(updateData)
    .where(eq(eventAnnouncements.id, announcementId))
    .returning()

  if (!updatedAnnouncement) {
    throw createError({
      statusCode: 500,
      message: 'Failed to update announcement',
    })
  }

  return successResponse(updatedAnnouncement)
})

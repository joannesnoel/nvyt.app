import { eventAnnouncements } from '@nvyt/db'
import { createEventAnnouncementSchema } from '@nvyt/shared'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const body = await readBody(event)

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  // Require canEdit permission
  await requireEventAccess(event, eventId, 'canEdit')

  const db = useDatabase()

  // Validate input
  const result = createEventAnnouncementSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const data = result.data

  // Create announcement
  const [newAnnouncement] = await db
    .insert(eventAnnouncements)
    .values({
      eventId,
      title: data.title,
      content: data.content,
      isPinned: data.isPinned ?? false,
      isPublished: data.isPublished ?? true,
    })
    .returning()

  if (!newAnnouncement) {
    throw createError({
      statusCode: 500,
      message: 'Failed to create announcement',
    })
  }

  return successResponse(newAnnouncement)
})

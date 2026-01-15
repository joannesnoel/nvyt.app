import { eventFaqs } from '@nvyt/db'
import { updateEventFaqSchema } from '@nvyt/shared'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const faqId = getRouterParam(event, 'faqId')
  const body = await readBody(event)

  if (!eventId || !faqId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID and FAQ ID are required',
    })
  }

  // Require canEdit permission
  await requireEventAccess(event, eventId, 'canEdit')

  const db = useDatabase()

  // Check FAQ exists and belongs to this event
  const [existingFaq] = await db
    .select()
    .from(eventFaqs)
    .where(
      and(
        eq(eventFaqs.id, faqId),
        eq(eventFaqs.eventId, eventId)
      )
    )
    .limit(1)

  if (!existingFaq) {
    throw createError({
      statusCode: 404,
      message: 'FAQ not found',
    })
  }

  // Validate input
  const result = updateEventFaqSchema.safeParse(body)
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

  if (data.question !== undefined) {
    updateData.question = data.question
  }
  if (data.answer !== undefined) {
    updateData.answer = data.answer
  }
  // Handle isActive if provided in body
  if (body.isActive !== undefined) {
    updateData.isActive = body.isActive
  }

  // Update FAQ
  const [updatedFaq] = await db
    .update(eventFaqs)
    .set(updateData)
    .where(eq(eventFaqs.id, faqId))
    .returning()

  if (!updatedFaq) {
    throw createError({
      statusCode: 500,
      message: 'Failed to update FAQ',
    })
  }

  return successResponse(updatedFaq)
})

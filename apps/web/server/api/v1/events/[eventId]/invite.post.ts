import { eq } from 'drizzle-orm'
import { events } from '@nvyt/db'
import { inviteAttendeesSchema } from '@nvyt/shared'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const eventId = getRouterParam(event, 'eventId')
  const body = await readBody(event)

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  // Validate input
  const result = inviteAttendeesSchema.safeParse({ ...body, eventId })
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const { emails, message } = result.data
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
      message: 'Only the organizer can send invitations',
    })
  }

  // Generate invite URL
  const config = useRuntimeConfig()
  const baseUrl = config.public.appUrl
  const inviteUrl = eventData.visibility === 'private' && eventData.inviteToken
    ? `${baseUrl}/events/${eventData.slug}?token=${eventData.inviteToken}`
    : `${baseUrl}/events/${eventData.slug}`

  // TODO: Send emails using Resend
  // For now, just return the invite details
  const invitations = emails.map(email => ({
    email,
    inviteUrl,
    status: 'pending' as const, // Would be 'sent' after email is sent
  }))

  // In production, this would:
  // 1. Queue emails for sending via BullMQ
  // 2. Track invitation status in a separate invitations table
  // 3. Handle bounces and delivery status

  return successResponse({
    message: `Invitations prepared for ${emails.length} recipients`,
    inviteUrl,
    invitations,
    customMessage: message,
  })
})

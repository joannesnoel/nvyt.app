import { eq, and, sql } from 'drizzle-orm'
import { events, attendees } from '@nvyt/db'
import { createRsvpSchema } from '@nvyt/shared'
import { nanoid } from 'nanoid'
import {
  sendEmail,
  rsvpConfirmationEmail,
  rsvpPendingEmail,
  rsvpWaitlistEmail,
} from '~/server/utils/email'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const eventId = getRouterParam(event, 'eventId')

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  const db = useDatabase()

  // Get event details
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

  // Check if event is published
  if (eventData.status !== 'published') {
    throw createError({
      statusCode: 400,
      message: 'This event is not accepting RSVPs',
    })
  }

  // Check registration mode - RSVP only works for 'rsvp' mode
  if (eventData.registrationMode !== 'rsvp') {
    if (eventData.registrationMode === 'tickets') {
      throw createError({
        statusCode: 400,
        message: 'This event requires tickets. Please purchase tickets instead of RSVP.',
      })
    } else if (eventData.registrationMode === 'open') {
      throw createError({
        statusCode: 400,
        message: 'This is an open event. No registration is required.',
      })
    }
  }

  // Check if user is the organizer (can't RSVP to own event)
  if (eventData.organizerId === user.id) {
    throw createError({
      statusCode: 400,
      message: 'You cannot RSVP to your own event',
    })
  }

  // Check if already RSVP'd
  const [existingRsvp] = await db
    .select()
    .from(attendees)
    .where(
      and(
        eq(attendees.eventId, eventId),
        eq(attendees.userId, user.id)
      )
    )
    .limit(1)

  if (existingRsvp) {
    throw createError({
      statusCode: 409,
      message: 'You have already RSVP\'d to this event',
    })
  }

  // Check capacity
  let status: 'pending' | 'confirmed' | 'waitlisted' = 'confirmed'

  if (eventData.maxAttendees) {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(attendees)
      .where(
        and(
          eq(attendees.eventId, eventId),
          eq(attendees.status, 'confirmed')
        )
      )

    const count = result[0]?.count ?? 0
    if (Number(count) >= eventData.maxAttendees) {
      status = 'waitlisted'
    }
  }

  // If event requires approval, set to pending
  if (eventData.requiresApproval && status === 'confirmed') {
    status = 'pending'
  }

  // Generate QR code
  const qrCode = `NVYT-${nanoid(12)}`

  // Create RSVP
  const [rsvp] = await db
    .insert(attendees)
    .values({
      eventId,
      userId: user.id,
      status,
      qrCode,
      respondedAt: new Date(),
    })
    .returning()

  // Send confirmation email (async, don't block response)
  const config = useRuntimeConfig()
  const eventUrl = `${config.public.appUrl}/events/${eventData.slug}`
  const eventDate = new Date(eventData.startDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  // Send appropriate email based on status
  if (status === 'confirmed') {
    const emailContent = rsvpConfirmationEmail({
      userName: user.name || 'there',
      eventTitle: eventData.title,
      eventDate,
      eventLocation: eventData.location || undefined,
      qrCode,
      eventUrl,
    })
    sendEmail({ to: user.email, ...emailContent })
      .catch(err => console.error('[RSVP] Failed to send confirmation email:', err))
  } else if (status === 'pending') {
    const emailContent = rsvpPendingEmail({
      userName: user.name || 'there',
      eventTitle: eventData.title,
      eventUrl,
    })
    sendEmail({ to: user.email, ...emailContent })
      .catch(err => console.error('[RSVP] Failed to send pending email:', err))
  } else if (status === 'waitlisted') {
    const emailContent = rsvpWaitlistEmail({
      userName: user.name || 'there',
      eventTitle: eventData.title,
      eventUrl,
    })
    sendEmail({ to: user.email, ...emailContent })
      .catch(err => console.error('[RSVP] Failed to send waitlist email:', err))
  }

  return successResponse({
    ...rsvp,
    message: status === 'waitlisted'
      ? 'You have been added to the waitlist'
      : status === 'pending'
        ? 'Your RSVP is pending approval from the organizer'
        : 'Your RSVP has been confirmed',
  })
})

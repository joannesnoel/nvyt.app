import { eq, and, sql } from 'drizzle-orm'
import { events, attendees, users } from '@nvyt/db'
import { sendEmail, waitlistPromotedEmail } from '~/server/utils/email'

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

  // Get existing RSVP
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

  if (!existingRsvp) {
    throw createError({
      statusCode: 404,
      message: 'RSVP not found',
    })
  }

  // Check if already checked in
  if (existingRsvp.checkedInAt) {
    throw createError({
      statusCode: 400,
      message: 'Cannot cancel RSVP after checking in',
    })
  }

  const wasConfirmed = existingRsvp.status === 'confirmed'

  // Update status to cancelled
  await db
    .update(attendees)
    .set({
      status: 'cancelled',
      updatedAt: new Date(),
    })
    .where(eq(attendees.id, existingRsvp.id))

  // If was confirmed and event has waitlist, promote next person
  if (wasConfirmed) {
    await promoteFromWaitlist(db, eventId)
  }

  return successResponse({
    message: 'Your RSVP has been cancelled',
  })
})

async function promoteFromWaitlist(db: ReturnType<typeof useDatabase>, eventId: string) {
  // Get event to check capacity
  const [eventData] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)

  if (!eventData?.maxAttendees) return

  // Count current confirmed attendees
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(attendees)
    .where(
      and(
        eq(attendees.eventId, eventId),
        eq(attendees.status, 'confirmed')
      )
    )

  const confirmedCount = Number(result[0]?.count ?? 0)

  // If there's room, promote the first waitlisted person
  if (confirmedCount < eventData.maxAttendees) {
    const [nextInLine] = await db
      .select({
        id: attendees.id,
        qrCode: attendees.qrCode,
        userId: attendees.userId,
      })
      .from(attendees)
      .where(
        and(
          eq(attendees.eventId, eventId),
          eq(attendees.status, 'waitlisted')
        )
      )
      .orderBy(attendees.createdAt)
      .limit(1)

    if (nextInLine) {
      await db
        .update(attendees)
        .set({
          status: 'confirmed',
          updatedAt: new Date(),
        })
        .where(eq(attendees.id, nextInLine.id))

      // Send email notification to promoted attendee
      const [promotedUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, nextInLine.userId))
        .limit(1)

      if (promotedUser) {
        const config = useRuntimeConfig()
        const eventUrl = `${config.public.appUrl}/events/${eventData.slug}`
        const eventDate = new Date(eventData.startDate).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZone: eventData.timezone || 'Asia/Manila',
        })

        const emailContent = waitlistPromotedEmail({
          userName: promotedUser.name || 'there',
          eventTitle: eventData.title,
          eventDate,
          eventLocation: eventData.location || undefined,
          qrCode: nextInLine.qrCode || '',
          eventUrl,
        })

        sendEmail({ to: promotedUser.email, ...emailContent })
          .catch(err => console.error('[Waitlist] Failed to send promotion email:', err))
      }
    }
  }
}

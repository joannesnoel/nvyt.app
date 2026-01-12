import { eq, and, sql } from 'drizzle-orm'
import { events, attendees, users } from '@nvyt/db'
import { updateRsvpStatusSchema } from '@nvyt/shared'
import {
  sendEmail,
  rsvpApprovedEmail,
  rsvpDeclinedEmail,
  waitlistPromotedEmail,
} from '~/server/utils/email'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const attendeeId = getRouterParam(event, 'attendeeId')
  const body = await readBody(event)

  if (!eventId || !attendeeId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID and Attendee ID are required',
    })
  }

  // Require canManageAttendees permission (owner or collaborator)
  await requireEventAccess(event, eventId, 'canManageAttendees')

  // Validate input
  const result = updateRsvpStatusSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const { status, notes } = result.data
  const db = useDatabase()

  // Get event data for capacity check and email
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

  // Get attendee
  const [attendee] = await db
    .select()
    .from(attendees)
    .where(
      and(
        eq(attendees.id, attendeeId),
        eq(attendees.eventId, eventId)
      )
    )
    .limit(1)

  if (!attendee) {
    throw createError({
      statusCode: 404,
      message: 'Attendee not found',
    })
  }

  const previousStatus = attendee.status

  // Check capacity if confirming
  if (status === 'confirmed' && eventData.maxAttendees) {
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(attendees)
      .where(
        and(
          eq(attendees.eventId, eventId),
          eq(attendees.status, 'confirmed')
        )
      )

    const confirmedCount = Number(countResult[0]?.count ?? 0)

    // Don't count current attendee if they were already confirmed
    const adjustedCount = previousStatus === 'confirmed' ? confirmedCount - 1 : confirmedCount

    if (adjustedCount >= eventData.maxAttendees) {
      throw createError({
        statusCode: 400,
        message: 'Event is at capacity. Cannot confirm more attendees.',
      })
    }
  }

  // Update attendee
  const [updated] = await db
    .update(attendees)
    .set({
      status,
      notes: notes ?? attendee.notes,
      updatedAt: new Date(),
    })
    .where(eq(attendees.id, attendeeId))
    .returning()

  // If declined/moved to waitlist from confirmed, promote next waitlisted
  if (previousStatus === 'confirmed' && status !== 'confirmed') {
    await promoteFromWaitlist(db, eventId, eventData)
  }

  // Send email notification about status change
  const [attendeeUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, attendee.userId))
    .limit(1)

  if (attendeeUser) {
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

    // Send appropriate email based on status change
    if (status === 'confirmed' && previousStatus !== 'confirmed') {
      const emailContent = rsvpApprovedEmail({
        userName: attendeeUser.name || 'there',
        eventTitle: eventData.title,
        eventDate,
        eventLocation: eventData.location || undefined,
        qrCode: attendee.qrCode || '',
        eventUrl,
      })
      sendEmail({ to: attendeeUser.email, ...emailContent })
        .catch(err => console.error('[Attendee] Failed to send approved email:', err))
    } else if (status === 'declined') {
      const emailContent = rsvpDeclinedEmail({
        userName: attendeeUser.name || 'there',
        eventTitle: eventData.title,
        eventUrl,
      })
      sendEmail({ to: attendeeUser.email, ...emailContent })
        .catch(err => console.error('[Attendee] Failed to send declined email:', err))
    }
  }

  return successResponse(updated)
})

async function promoteFromWaitlist(
  db: ReturnType<typeof useDatabase>,
  eventId: string,
  eventData: { maxAttendees: number | null; title: string; slug: string; startDate: Date; location: string | null }
) {
  if (!eventData.maxAttendees) return

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

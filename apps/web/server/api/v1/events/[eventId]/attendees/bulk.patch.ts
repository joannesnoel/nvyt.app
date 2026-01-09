import { eq, and, inArray, sql } from 'drizzle-orm'
import { events, attendees } from '@nvyt/db'
import { bulkUpdateRsvpSchema } from '@nvyt/shared'

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
  const result = bulkUpdateRsvpSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const { attendeeIds, status } = result.data
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
      message: 'Only the organizer can update attendee status',
    })
  }

  // Check capacity if confirming
  if (status === 'confirmed' && eventData.maxAttendees) {
    // Get current confirmed count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(attendees)
      .where(
        and(
          eq(attendees.eventId, eventId),
          eq(attendees.status, 'confirmed')
        )
      )

    const currentConfirmed = Number(countResult[0]?.count ?? 0)

    // Get how many of the selected are already confirmed
    const alreadyConfirmedResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(attendees)
      .where(
        and(
          eq(attendees.eventId, eventId),
          eq(attendees.status, 'confirmed'),
          inArray(attendees.id, attendeeIds)
        )
      )

    const alreadyConfirmed = Number(alreadyConfirmedResult[0]?.count ?? 0)
    const newConfirmations = attendeeIds.length - alreadyConfirmed

    if (currentConfirmed + newConfirmations > eventData.maxAttendees) {
      throw createError({
        statusCode: 400,
        message: `Cannot confirm ${newConfirmations} attendees. Only ${eventData.maxAttendees - currentConfirmed} spots available.`,
      })
    }
  }

  // Get previous statuses for waitlist promotion logic
  const previousAttendees = await db
    .select()
    .from(attendees)
    .where(
      and(
        eq(attendees.eventId, eventId),
        inArray(attendees.id, attendeeIds)
      )
    )

  const hadConfirmed = previousAttendees.some(a => a.status === 'confirmed')

  // Update all attendees
  await db
    .update(attendees)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(attendees.eventId, eventId),
        inArray(attendees.id, attendeeIds)
      )
    )

  // If any were confirmed and now aren't, check waitlist
  if (hadConfirmed && status !== 'confirmed' && eventData.maxAttendees) {
    // Promote from waitlist for each spot that opened
    const spotsOpened = previousAttendees.filter(a => a.status === 'confirmed').length

    for (let i = 0; i < spotsOpened; i++) {
      const [nextInLine] = await db
        .select()
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

        // TODO: Send email notification to promoted attendee
      } else {
        break // No more waitlisted attendees
      }
    }
  }

  // TODO: Send bulk email notifications about status change

  return successResponse({
    message: `Updated ${attendeeIds.length} attendees to ${status}`,
    count: attendeeIds.length,
  })
})

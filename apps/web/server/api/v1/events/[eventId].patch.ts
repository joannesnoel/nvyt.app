import { eq, and, inArray } from 'drizzle-orm'
import { events, attendees, users, tickets, orders } from '@nvyt/db'
import { updateEventSchema } from '@nvyt/shared'
import { sendEmail, eventCancelledEmail } from '~/server/utils/email'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const body = await readBody(event)

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  // Require canEdit permission (owner or collaborator)
  await requireEventAccess(event, eventId, 'canEdit')

  const db = useDatabase()

  // Get existing event
  const [existingEvent] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)

  if (!existingEvent) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  // Validate input (allow status to be updated separately)
  const allowedStatusValues = ['draft', 'published', 'cancelled', 'completed'] as const
  const statusUpdate = body.status && allowedStatusValues.includes(body.status)
    ? { status: body.status as typeof allowedStatusValues[number] }
    : {}

  // Validate other fields
  const result = updateEventSchema.safeParse(body)
  
  if (!result.success && !statusUpdate.status) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const updateData: Record<string, unknown> = {
    ...statusUpdate,
    updatedAt: new Date(),
  }

  // Add validated fields if present in body (check body keys, not parsed data)
  // This ensures we update fields that were explicitly sent
  if (result.success) {
    const data = result.data
    if ('title' in body) updateData.title = data.title
    if ('description' in body) updateData.description = data.description
    if ('coverImage' in body) updateData.coverImage = data.coverImage
    if ('startDate' in body && data.startDate) updateData.startDate = new Date(data.startDate)
    if ('endDate' in body) updateData.endDate = data.endDate ? new Date(data.endDate) : null
    if ('timezone' in body) updateData.timezone = data.timezone
    if ('location' in body) updateData.location = data.location
    if ('locationDetails' in body) updateData.locationDetails = data.locationDetails
    if ('visibility' in body) updateData.visibility = data.visibility
    if ('registrationMode' in body) updateData.registrationMode = data.registrationMode
    if ('maxAttendees' in body) updateData.maxAttendees = data.maxAttendees ?? null
    if ('requiresApproval' in body) updateData.requiresApproval = data.requiresApproval
    if ('ticketingEnabled' in body) updateData.ticketingEnabled = data.ticketingEnabled
    if ('contributionsEnabled' in body) updateData.contributionsEnabled = data.contributionsEnabled
  }

  // Update event
  const [updated] = await db
    .update(events)
    .set(updateData)
    .where(eq(events.id, eventId))
    .returning()

  // If status changed to cancelled, notify all attendees
  if (statusUpdate.status === 'cancelled' && existingEvent.status !== 'cancelled') {
    // Get organizer name
    const [organizer] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, existingEvent.organizerId))
      .limit(1)

    const organizerName = organizer?.name || 'The organizer'
    const eventDate = new Date(existingEvent.startDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

    // Get all confirmed/pending RSVP attendees
    const rsvpAttendees = await db
      .select({
        email: users.email,
        name: users.name,
      })
      .from(attendees)
      .innerJoin(users, eq(attendees.userId, users.id))
      .where(
        and(
          eq(attendees.eventId, eventId),
          inArray(attendees.status, ['confirmed', 'pending', 'waitlisted'])
        )
      )

    // Get all ticket holders
    const ticketHolders = await db
      .select({
        email: tickets.attendeeEmail,
        name: tickets.attendeeName,
      })
      .from(tickets)
      .innerJoin(orders, eq(tickets.orderId, orders.id))
      .where(
        and(
          eq(orders.eventId, eventId),
          inArray(tickets.status, ['confirmed', 'pending'])
        )
      )

    // Combine and deduplicate by email
    const allAttendees = new Map<string, string>()
    for (const a of rsvpAttendees) {
      allAttendees.set(a.email, a.name || 'there')
    }
    for (const t of ticketHolders) {
      if (!allAttendees.has(t.email)) {
        allAttendees.set(t.email, t.name || 'there')
      }
    }

    // Send cancellation emails (async, don't block response)
    for (const [email, name] of allAttendees) {
      const emailContent = eventCancelledEmail({
        userName: name,
        eventTitle: existingEvent.title,
        eventDate,
        organizerName,
      })

      sendEmail({ to: email, ...emailContent })
        .catch(err => console.error(`[Event] Failed to send cancellation email to ${email}:`, err))
    }

    console.log(`[Event] Sent cancellation emails to ${allAttendees.size} attendees for event ${eventId}`)
  }

  return successResponse(updated)
})

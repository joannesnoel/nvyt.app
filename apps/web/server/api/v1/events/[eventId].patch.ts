import { eq, and, inArray } from 'drizzle-orm'
import { events, attendees, users, tickets, orders, ticketTypes, eventVerifications } from '@nvyt/db'
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

  // Require thumbnail image when publishing (public events only)
  const eventVisibility = ('visibility' in body && body.visibility) || existingEvent.visibility
  if (statusUpdate.status === 'published' && existingEvent.status !== 'published' && eventVisibility !== 'private') {
    const hasThumbnail = ('thumbnailImage' in body && body.thumbnailImage) || existingEvent.thumbnailImage
    if (!hasThumbnail) {
      throw createError({
        statusCode: 400,
        message: 'A thumbnail image is required before publishing. Please upload a thumbnail image in the event settings.',
        data: { code: 'THUMBNAIL_REQUIRED' },
      })
    }
  }

  // Prevent removing thumbnail image on a published public event
  if (existingEvent.status === 'published' && eventVisibility !== 'private' && 'thumbnailImage' in body && !body.thumbnailImage) {
    throw createError({
      statusCode: 400,
      message: 'Cannot remove the thumbnail image while the event is published. You can replace it with a different image.',
      data: { code: 'THUMBNAIL_REMOVAL_BLOCKED' },
    })
  }

  // Check verification requirement when publishing
  if (statusUpdate.status === 'published' && existingEvent.status !== 'published') {
    // Check if this event has paid tickets
    const eventTickets = await db
      .select()
      .from(ticketTypes)
      .where(eq(ticketTypes.eventId, eventId))

    const hasPaidTickets =
      existingEvent.registrationMode === 'tickets' &&
      eventTickets.some((t) => parseFloat(t.price) > 0)

    if (hasPaidTickets) {
      // Check verification status
      const [verification] = await db
        .select()
        .from(eventVerifications)
        .where(eq(eventVerifications.eventId, eventId))
        .limit(1)

      if (!verification) {
        throw createError({
          statusCode: 400,
          message: 'Events selling paid tickets require verification before publishing. Please submit your business documents for verification.',
          data: { code: 'VERIFICATION_REQUIRED', verificationStatus: 'not_submitted' },
        })
      }

      if (verification.status !== 'approved') {
        const statusMessages: Record<string, string> = {
          pending: 'Your verification is pending review. Please wait for approval before publishing.',
          under_review: 'Your verification is currently under review. Please wait for approval before publishing.',
          rejected: verification.rejectionReason 
            ? `Your verification was rejected: ${verification.rejectionReason}. Please resubmit with valid documents.`
            : 'Your verification was rejected. Please resubmit with valid documents.',
        }

        throw createError({
          statusCode: 400,
          message: statusMessages[verification.status] || 'Verification required to publish paid events.',
          data: { 
            code: 'VERIFICATION_NOT_APPROVED', 
            verificationStatus: verification.status,
            rejectionReason: verification.rejectionReason,
          },
        })
      }
    }
  }

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
    if ('thumbnailImage' in body) updateData.thumbnailImage = data.thumbnailImage
    if ('coverImage' in body) updateData.coverImage = data.coverImage
    if ('promoVideoUrl' in body) updateData.promoVideoUrl = data.promoVideoUrl ?? null
    if ('mediaType' in body) updateData.mediaType = data.mediaType
    if ('organizationName' in body) updateData.organizationName = data.organizationName ?? null
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
    if ('theme' in body) updateData.theme = data.theme ?? null // null = follow visitor's system preference
    if ('colorTemplate' in body) updateData.colorTemplate = data.colorTemplate
    if ('titleFontFamily' in body) updateData.titleFontFamily = data.titleFontFamily
    if ('fontFamily' in body) updateData.fontFamily = data.fontFamily
    if ('bodyFontFamily' in body) updateData.bodyFontFamily = data.bodyFontFamily
    // Contact & Social
    if ('phone' in body) updateData.phone = data.phone
    if ('email' in body) updateData.email = data.email
    if ('website' in body) updateData.website = data.website ?? null
    if ('facebookUrl' in body) updateData.facebookUrl = data.facebookUrl ?? null
    if ('instagramUrl' in body) updateData.instagramUrl = data.instagramUrl ?? null
    if ('xUrl' in body) updateData.xUrl = data.xUrl ?? null
    // Registration form built-in fields
    if ('collectAttendeeAddress' in body) updateData.collectAttendeeAddress = data.collectAttendeeAddress
    if ('collectAttendeeSex' in body) updateData.collectAttendeeSex = data.collectAttendeeSex
    if ('attendeeSexOptions' in body) updateData.attendeeSexOptions = data.attendeeSexOptions
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

    // Get all ticket holders - need to get email from user record via attendeeUserId
    const ticketHolders = await db
      .select({
        attendeeUserId: tickets.attendeeUserId,
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

    // Fetch emails for ticket holders with attendeeUserId
    const attendeeUserIds = ticketHolders
      .map(t => t.attendeeUserId)
      .filter((id): id is string => id !== null)

    const attendeeEmailsMap = new Map<string, string>()
    if (attendeeUserIds.length > 0) {
      const attendeeUsers = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(inArray(users.id, attendeeUserIds))

      for (const u of attendeeUsers) {
        attendeeEmailsMap.set(u.id, u.email)
      }
    }

    // Combine and deduplicate by email
    const allAttendees = new Map<string, string>()
    for (const a of rsvpAttendees) {
      if (a.email) {
        allAttendees.set(a.email, a.name || 'there')
      }
    }
    for (const t of ticketHolders) {
      const email = t.attendeeUserId ? attendeeEmailsMap.get(t.attendeeUserId) : null
      if (email && !allAttendees.has(email)) {
        allAttendees.set(email, t.name || 'there')
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

import { eq, and, inArray } from 'drizzle-orm'
import { events, eventInvitations, users } from '@nvyt/db'
import { inviteAttendeesSchema } from '@nvyt/shared'
import { randomBytes } from 'crypto'
import { sendEmail, rsvpInvitationEmail } from '~/server/utils/email'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const eventId = getRouterParam(event, 'eventId')
  const body = await readBody(event)
  const config = useRuntimeConfig()

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

  const { invitees, message } = result.data
  const db = useDatabase()

  // Verify user is the organizer or has permission
  const [eventData] = await db
    .select({
      id: events.id,
      title: events.title,
      slug: events.slug,
      description: events.description,
      startDate: events.startDate,
      location: events.location,
      visibility: events.visibility,
      inviteToken: events.inviteToken,
      organizerId: events.organizerId,
      organizationName: events.organizationName,
      registrationMode: events.registrationMode,
      thumbnailImage: events.thumbnailImage,
    })
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

  // Normalize emails to lowercase and build lookup
  const normalizedInvitees = invitees.map(i => ({ name: i.name, email: i.email.toLowerCase() }))
  const allEmails = normalizedInvitees.map(i => i.email)

  // Check for already invited emails
  const existingInvitations = await db
    .select({ email: eventInvitations.email })
    .from(eventInvitations)
    .where(
      and(
        eq(eventInvitations.eventId, eventId),
        inArray(eventInvitations.email, allEmails)
      )
    )

  const alreadyInvitedEmails = new Set(existingInvitations.map(i => i.email))
  const newInvitees = normalizedInvitees.filter(i => !alreadyInvitedEmails.has(i.email))

  if (newInvitees.length === 0) {
    return successResponse({
      message: 'All recipients have already been invited',
      sent: 0,
      alreadyInvited: allEmails.length,
      invitations: [],
    })
  }

  // Generate base URL for invitations
  const baseUrl = config.public?.appUrl || 'https://nvyt.app'

  // Format event date
  const eventDate = eventData.startDate
    ? new Date(eventData.startDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'TBD'

  // Prepare invitation records with tokens
  const invitationValues = newInvitees.map(invitee => {
    const inviteToken = randomBytes(32).toString('hex')
    return {
      eventId,
      email: invitee.email,
      name: invitee.name || null,
      inviteToken,
      invitedBy: user.id,
      message: message || null,
    }
  })

  // Batch insert all invitation records at once
  const invitations = await db
    .insert(eventInvitations)
    .values(invitationValues)
    .returning()

  // Build a lookup from email to invitation for RSVP URLs
  const invitationByEmail = new Map(invitations.map(i => [i.email, i]))

  // Send emails in parallel with concurrency limit
  const CONCURRENCY = 10
  const emailResults: { email: string; success: boolean; error?: string }[] = []

  for (let i = 0; i < newInvitees.length; i += CONCURRENCY) {
    const batch = newInvitees.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.all(
      batch.map(async (invitee) => {
        const invitation = invitationByEmail.get(invitee.email)
        if (!invitation) return { email: invitee.email, success: false, error: 'No invitation record' }

        let rsvpUrl = `${baseUrl}/events/${eventData.slug}?invite=${invitation.inviteToken}`
        if (eventData.visibility === 'private' && eventData.inviteToken) {
          rsvpUrl += `&token=${eventData.inviteToken}`
        }

        const emailContent = rsvpInvitationEmail({
          inviteeName: invitee.name,
          organizerName: eventData.organizationName || user.name || 'Event Organizer',
          eventTitle: eventData.title,
          eventDate,
          eventLocation: eventData.location || undefined,
          eventDescription: eventData.description || undefined,
          eventThumbnail: eventData.thumbnailImage || undefined,
          isTicketEvent: eventData.registrationMode === 'tickets',
          customMessage: message,
          rsvpUrl,
        })

        const result = await sendEmail({
          to: invitee.email,
          subject: emailContent.subject,
          html: emailContent.html,
        })

        return { email: invitee.email, success: result.success, error: result.error }
      })
    )
    emailResults.push(...batchResults)
  }

  const successCount = emailResults.filter(r => r.success).length
  const failedEmails = emailResults.filter(r => !r.success).map(r => r.email)

  return successResponse({
    message: `Invitations sent to ${successCount} of ${newInvitees.length} recipients`,
    sent: successCount,
    failed: failedEmails.length,
    failedEmails: failedEmails.length > 0 ? failedEmails : undefined,
    alreadyInvited: alreadyInvitedEmails.size,
    invitations: invitations.map(i => ({
      id: i.id,
      email: i.email,
      name: i.name,
      status: i.status,
      invitedAt: i.invitedAt,
    })),
  })
})

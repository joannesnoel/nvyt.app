import { eq, and, sql } from 'drizzle-orm'
import { events, attendees, users, eventInvitations, type User } from '@nvyt/db'
import { createRsvpSchema } from '@nvyt/shared'
import { nanoid } from 'nanoid'
import {
  sendEmail,
  rsvpConfirmationEmail,
  rsvpPendingEmail,
  rsvpWaitlistEmail,
  accountSetupEmail,
} from '~/server/utils/email'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const query = getQuery(event)
  const eventId = getRouterParam(event, 'eventId')
  const inviteToken = (query.invite || body.inviteToken) as string | undefined

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  // Validate input
  const result = createRsvpSchema.safeParse({ ...body, eventId })
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const data = result.data
  const db = useDatabase()
  const config = useRuntimeConfig()

  // Handle authentication - support both logged in users and guests
  let user: User
  let needsAccountSetup = false

  // Try to get authenticated user first
  const existingUser = await getUserFromEvent(event)

  if (existingUser) {
    // User is logged in
    user = existingUser
  } else if (data.isGuest && data.guestName && data.guestEmail) {
    // Guest RSVP - find or create user
    const [existingAccount] = await db
      .select()
      .from(users)
      .where(eq(users.email, data.guestEmail.toLowerCase()))
      .limit(1)

    if (existingAccount) {
      if (existingAccount.passwordHash) {
        // Account exists with password - prompt to login
        throw createError({
          statusCode: 409,
          message: 'An account with this email already exists. Please log in to RSVP.',
          data: { code: 'ACCOUNT_EXISTS_WITH_PASSWORD' },
        })
      }
      // Account exists without password - use it
      user = existingAccount
      needsAccountSetup = true
    } else {
      // Create new guest user
      const [newUser] = await db
        .insert(users)
        .values({
          name: data.guestName,
          email: data.guestEmail.toLowerCase(),
          passwordHash: null,
          emailVerified: false,
        })
        .returning()

      if (!newUser) {
        throw createError({
          statusCode: 500,
          message: 'Failed to create account',
        })
      }

      user = newUser
      needsAccountSetup = true
    }
  } else {
    // Not logged in and not guest RSVP
    throw createError({
      statusCode: 401,
      message: 'You must be logged in or provide guest details to RSVP',
    })
  }

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

  // Block RSVPs for draft public events (private draft events are accessible via invite link)
  if (eventData.status !== 'published' && !(eventData.status === 'draft' && eventData.visibility === 'private')) {
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

  // Check for invitation - either by token or by email
  let invitation = null
  if (inviteToken) {
    // Look up by token
    invitation = await db.query.eventInvitations.findFirst({
      where: and(
        eq(eventInvitations.inviteToken, inviteToken),
        eq(eventInvitations.eventId, eventId),
        eq(eventInvitations.status, 'pending')
      ),
    })
  }

  // Also check by email if no token match
  if (!invitation) {
    invitation = await db.query.eventInvitations.findFirst({
      where: and(
        eq(eventInvitations.email, user.email.toLowerCase()),
        eq(eventInvitations.eventId, eventId),
        eq(eventInvitations.status, 'pending')
      ),
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
      // Link invitation if found
      invitedBy: invitation?.invitedBy || null,
      invitedAt: invitation?.invitedAt || null,
    })
    .returning()

  // Mark invitation as accepted
  if (invitation) {
    await db
      .update(eventInvitations)
      .set({
        status: 'accepted',
        acceptedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(eventInvitations.id, invitation.id))
  }

  // Send confirmation email (async, don't block response)
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

  // Send account setup email for guest users
  if (needsAccountSetup) {
    const setupToken = await createAccountSetupToken(user.id)
    const appUrl = config.public.appUrl as string

    sendEmail({
      to: user.email,
      ...accountSetupEmail({
        userName: user.name,
        setupUrl: `${appUrl}/setup-account?token=${setupToken}`,
        eventTitle: eventData.title,
      }),
    }).catch(err => console.error('[RSVP] Failed to send account setup email:', err))
  }

  return successResponse({
    ...rsvp,
    accountSetupRequired: needsAccountSetup,
    message: status === 'waitlisted'
      ? 'You have been added to the waitlist'
      : status === 'pending'
        ? 'Your RSVP is pending approval from the organizer'
        : needsAccountSetup
          ? 'Your RSVP has been confirmed! Check your email to set up your account.'
          : 'Your RSVP has been confirmed',
  })
})

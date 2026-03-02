import { eq, and, or } from 'drizzle-orm'
import { users, eventCollaborators, events } from '@nvyt/db'
import { inviteCollaboratorSchema } from '@nvyt/shared'
import { randomBytes } from 'crypto'
import { sendEmail, collaboratorInvitationEmail } from '~/server/utils/email'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const body = await readBody(event)
  const config = useRuntimeConfig()

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  // Only owners can invite collaborators
  const { user } = await requireEventOwner(event, eventId)

  // Validate input
  const result = inviteCollaboratorSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const data = result.data
  const invitedEmailLower = data.email.toLowerCase()
  const db = useDatabase()

  // Find the user to invite by email (might not exist)
  const [invitedUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, invitedEmailLower))
    .limit(1)

  // Cannot invite yourself
  if (invitedUser && invitedUser.id === user.id) {
    throw createError({
      statusCode: 400,
      message: 'You cannot invite yourself as a collaborator',
    })
  }

  // Check if already a collaborator (by userId or by pending email invitation)
  const existing = await db.query.eventCollaborators.findFirst({
    where: and(
      eq(eventCollaborators.eventId, eventId),
      or(
        invitedUser ? eq(eventCollaborators.userId, invitedUser.id) : undefined,
        eq(eventCollaborators.invitedEmail, invitedEmailLower)
      )
    ),
  })

  if (existing) {
    throw createError({
      statusCode: 409,
      message: existing.userId
        ? 'This user is already a collaborator on this event'
        : 'An invitation has already been sent to this email address',
    })
  }

  // Get the event details for email and response
  const [eventData] = await db
    .select({
      title: events.title,
      startDate: events.startDate,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)

  const isNewUser = !invitedUser
  const inviteToken = isNewUser ? randomBytes(32).toString('hex') : null

  // Create the collaborator record
  const [collaborator] = await db
    .insert(eventCollaborators)
    .values({
      eventId,
      userId: invitedUser?.id || null,
      invitedEmail: isNewUser ? invitedEmailLower : null,
      inviteToken,
      canEdit: data.canEdit,
      canPublish: data.canPublish,
      canManageTickets: data.canManageTickets,
      canCheckIn: data.canCheckIn,
      canManageAttendees: data.canManageAttendees,
      canViewAnalytics: data.canViewAnalytics,
      invitedBy: user.id,
    })
    .returning()

  // Build permissions list for email
  const permissions: string[] = []
  if (data.canEdit) permissions.push('Edit event details')
  if (data.canPublish) permissions.push('Publish/unpublish event')
  if (data.canManageTickets) permissions.push('Manage tickets')
  if (data.canCheckIn) permissions.push('Check in attendees')
  if (data.canManageAttendees) permissions.push('Manage attendees')
  if (data.canViewAnalytics) permissions.push('View analytics')

  // Build accept URL
  const appUrl = config.public?.appUrl || 'https://nvyt.app'
  const acceptUrl = isNewUser
    ? `${appUrl}/register?invite=${inviteToken}`
    : `${appUrl}/dashboard/events/${eventId}?invite=accept`

  // Send invitation email
  const emailContent = collaboratorInvitationEmail({
    inviterName: user.name || 'An event organizer',
    eventTitle: eventData?.title || 'Event',
    eventDate: eventData?.startDate
      ? new Date(eventData.startDate).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : 'TBD',
    permissions,
    acceptUrl,
    isNewUser,
  })

  await sendEmail({
    to: invitedEmailLower,
    subject: emailContent.subject,
    html: emailContent.html,
  })

  return successResponse({
    ...collaborator,
    user: invitedUser
      ? {
          id: invitedUser.id,
          email: invitedUser.email,
          name: invitedUser.name,
        }
      : null,
    invitedEmail: isNewUser ? invitedEmailLower : null,
    isPending: isNewUser,
    event: {
      id: eventId,
      title: eventData?.title,
    },
  })
})

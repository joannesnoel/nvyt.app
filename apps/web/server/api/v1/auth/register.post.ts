import { eq, and, isNull, isNotNull } from 'drizzle-orm'
import { users, eventCollaborators } from '@nvyt/db'
import { registerSchema } from '@nvyt/shared'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // Validate input
  const result = registerSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const { name, email, password, inviteToken } = result.data as {
    name: string
    email: string
    password: string
    inviteToken?: string
  }
  const db = useDatabase()

  // Check if user already exists
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1)

  if (existingUser) {
    throw createError({
      statusCode: 409,
      message: 'An account with this email already exists',
    })
  }

  // If invite token provided, validate it
  let pendingInvitation = null
  if (inviteToken) {
    pendingInvitation = await db.query.eventCollaborators.findFirst({
      where: and(
        eq(eventCollaborators.inviteToken, inviteToken),
        isNull(eventCollaborators.userId),
        isNotNull(eventCollaborators.invitedEmail)
      ),
    })

    if (!pendingInvitation) {
      throw createError({
        statusCode: 400,
        message: 'Invalid or expired invitation token',
      })
    }

    // Verify the email matches
    if (pendingInvitation.invitedEmail?.toLowerCase() !== email.toLowerCase()) {
      throw createError({
        statusCode: 400,
        message: 'Email does not match the invitation',
      })
    }
  }

  // Create user
  const passwordHash = await hashPassword(password)
  const [user] = await db
    .insert(users)
    .values({
      name,
      email: email.toLowerCase(),
      passwordHash,
    })
    .returning()

  if (!user) {
    throw createError({
      statusCode: 500,
      message: 'Failed to create user',
    })
  }

  // Link pending invitation if provided
  if (pendingInvitation) {
    await db
      .update(eventCollaborators)
      .set({
        userId: user.id,
        invitedEmail: null,
        inviteToken: null,
        acceptedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(eventCollaborators.id, pendingInvitation.id))
  }

  // Also link any other pending invitations for this email
  await db
    .update(eventCollaborators)
    .set({
      userId: user.id,
      invitedEmail: null,
      inviteToken: null,
      acceptedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(eventCollaborators.invitedEmail, email.toLowerCase()),
        isNull(eventCollaborators.userId)
      )
    )

  // Create session
  const sessionToken = await createSession(event, user)
  const accessToken = await createAccessToken(user)

  return successResponse({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
    accessToken, // For mobile apps
    sessionToken, // For reference (cookie is also set)
    linkedInvitation: pendingInvitation ? {
      eventId: pendingInvitation.eventId,
    } : null,
  })
})

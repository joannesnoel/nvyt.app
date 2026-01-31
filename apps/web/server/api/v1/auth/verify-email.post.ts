import { eq, and, isNull, gt } from 'drizzle-orm'
import { users, emailVerificationTokens } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { token } = body

  if (!token) {
    throw createError({
      statusCode: 400,
      message: 'Verification token is required',
    })
  }

  const db = useDatabase()

  // Find valid token
  const [verificationToken] = await db
    .select()
    .from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.token, token),
        isNull(emailVerificationTokens.usedAt),
        gt(emailVerificationTokens.expiresAt, new Date())
      )
    )
    .limit(1)

  if (!verificationToken) {
    throw createError({
      statusCode: 400,
      message: 'Invalid or expired verification token',
    })
  }

  // Mark token as used
  await db
    .update(emailVerificationTokens)
    .set({ usedAt: new Date() })
    .where(eq(emailVerificationTokens.id, verificationToken.id))

  // Mark email as verified
  await db
    .update(users)
    .set({
      emailVerified: true,
      updatedAt: new Date(),
    })
    .where(eq(users.id, verificationToken.userId))

  // Get user for session creation
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, verificationToken.userId))
    .limit(1)

  // Auto-login: create session and set cookie
  const sessionToken = await createSession(event, user)
  const accessToken = await createAccessToken(user)

  return successResponse({
    message: 'Email verified successfully',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      emailVerified: true,
    },
    accessToken,
    sessionToken,
  })
})

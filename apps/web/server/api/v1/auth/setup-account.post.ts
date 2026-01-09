import { eq } from 'drizzle-orm'
import { users } from '@nvyt/db'
import { accountSetupSchema } from '@nvyt/shared'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // Validate input
  const result = accountSetupSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const { token, password } = result.data
  const db = useDatabase()

  // Verify token
  const tokenStatus = await verifyAccountSetupToken(token)

  if (!tokenStatus.valid) {
    if (tokenStatus.expired) {
      throw createError({
        statusCode: 410,
        message: 'This setup link has expired. Please use the "Resend setup link" option on the login page, or use forgot password.',
        data: { code: 'TOKEN_EXPIRED' },
      })
    }
    throw createError({
      statusCode: 400,
      message: 'Invalid or already used setup link',
      data: { code: 'TOKEN_INVALID' },
    })
  }

  // Get user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, tokenStatus.userId))
    .limit(1)

  if (!user) {
    throw createError({
      statusCode: 404,
      message: 'User not found',
    })
  }

  if (user.passwordHash) {
    throw createError({
      statusCode: 400,
      message: 'Password already set for this account. Please use login instead.',
    })
  }

  // Set password
  const passwordHash = await hashPassword(password)
  await db
    .update(users)
    .set({
      passwordHash,
      emailVerified: true,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))

  // Mark token as used
  await markSetupTokenUsed(token)

  // Create session
  const updatedUser = { ...user, passwordHash, emailVerified: true }
  const sessionToken = await createSession(event, updatedUser)
  const accessToken = await createAccessToken(updatedUser)

  return successResponse({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
    accessToken,
    sessionToken,
    message: 'Account setup complete!',
  })
})

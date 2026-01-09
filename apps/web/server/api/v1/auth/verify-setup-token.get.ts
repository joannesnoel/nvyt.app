import { eq } from 'drizzle-orm'
import { users } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const { token } = getQuery(event)

  if (!token || typeof token !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'Token is required',
    })
  }

  const tokenStatus = await verifyAccountSetupToken(token)

  if (!tokenStatus.valid) {
    return successResponse({
      valid: false,
      expired: tokenStatus.expired,
      message: tokenStatus.expired
        ? 'This setup link has expired'
        : 'Invalid or already used setup link',
    })
  }

  // Get user info for display
  const db = useDatabase()
  const [user] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, tokenStatus.userId))
    .limit(1)

  return successResponse({
    valid: true,
    expired: false,
    user: user ? { email: user.email, name: user.name } : null,
  })
})

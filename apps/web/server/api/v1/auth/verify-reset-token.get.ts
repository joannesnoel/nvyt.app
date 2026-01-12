import { eq, and, isNull, gt } from 'drizzle-orm'
import { users, passwordResetTokens } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = query.token as string

  if (!token) {
    throw createError({
      statusCode: 400,
      message: 'Token is required',
    })
  }

  const db = useDatabase()

  // Find valid reset token
  const resetToken = await db.query.passwordResetTokens.findFirst({
    where: and(
      eq(passwordResetTokens.token, token),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, new Date())
    ),
  })

  if (!resetToken) {
    throw createError({
      statusCode: 400,
      message: 'Invalid or expired reset link',
    })
  }

  // Get user email for display
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, resetToken.userId))
    .limit(1)

  return successResponse({
    valid: true,
    email: user?.email,
  })
})

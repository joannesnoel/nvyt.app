import { eq, and, isNull, gt } from 'drizzle-orm'
import { users, passwordResetTokens } from '@nvyt/db'
import { resetPasswordSchema } from '@nvyt/shared'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // Validate input
  const result = resetPasswordSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const { token, password } = result.data
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
      message: 'Invalid or expired reset link. Please request a new password reset.',
    })
  }

  // Get user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, resetToken.userId))
    .limit(1)

  if (!user) {
    throw createError({
      statusCode: 400,
      message: 'User not found',
    })
  }

  // Hash new password
  const passwordHash = await hashPassword(password)

  // Update user password
  await db
    .update(users)
    .set({
      passwordHash,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))

  // Mark token as used
  await db
    .update(passwordResetTokens)
    .set({
      usedAt: new Date(),
    })
    .where(eq(passwordResetTokens.id, resetToken.id))

  // Invalidate all other reset tokens for this user
  await db
    .delete(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.userId, user.id),
        isNull(passwordResetTokens.usedAt)
      )
    )

  return successResponse({
    message: 'Password reset successful. You can now log in with your new password.',
  })
})

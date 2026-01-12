import { eq } from 'drizzle-orm'
import { users, passwordResetTokens } from '@nvyt/db'
import { forgotPasswordSchema } from '@nvyt/shared'
import { randomBytes } from 'crypto'
import { sendEmail, passwordResetEmail } from '~/server/utils/email'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const config = useRuntimeConfig()

  // Validate input
  const result = forgotPasswordSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const { email } = result.data
  const db = useDatabase()

  // Find user by email
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1)

  // Always return success to prevent email enumeration
  // But only send email if user exists
  if (user) {
    // Generate reset token
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    // Delete any existing reset tokens for this user
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id))

    // Create new reset token
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token,
      expiresAt,
    })

    // Send reset email
    const appUrl = config.public?.appUrl || 'https://nvyt.app'
    const resetUrl = `${appUrl}/reset-password?token=${token}`

    const emailContent = passwordResetEmail({
      userName: user.name || 'there',
      resetUrl,
    })

    await sendEmail({
      to: user.email,
      subject: emailContent.subject,
      html: emailContent.html,
    })
  }

  // Always return success
  return successResponse({
    message: 'If an account exists with that email, you will receive a password reset link.',
  })
})

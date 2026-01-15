import { eq } from 'drizzle-orm'
import { users, emailVerificationTokens } from '@nvyt/db'
import { nanoid } from 'nanoid'
import { sendEmail, emailVerificationEmail } from '~/server/utils/email'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const db = useDatabase()
  const config = useRuntimeConfig()

  // Check if already verified
  if (user.emailVerified) {
    throw createError({
      statusCode: 400,
      message: 'Email is already verified',
    })
  }

  // Invalidate any existing tokens by marking them as used
  await db
    .update(emailVerificationTokens)
    .set({ usedAt: new Date() })
    .where(eq(emailVerificationTokens.userId, user.id))

  // Create new verification token
  const verificationToken = nanoid(32)
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

  await db.insert(emailVerificationTokens).values({
    userId: user.id,
    token: verificationToken,
    expiresAt,
  })

  // Send verification email
  const verificationUrl = `${config.public.appUrl}/verify-email?token=${verificationToken}`

  try {
    await sendEmail({
      to: user.email,
      ...emailVerificationEmail({
        userName: user.name,
        verificationUrl,
      }),
    })
  } catch (emailError) {
    console.error('[Resend Verification] Failed to send email:', emailError)
    throw createError({
      statusCode: 500,
      message: 'Failed to send verification email. Please try again.',
    })
  }

  return successResponse({
    message: 'Verification email sent. Please check your inbox.',
  })
})

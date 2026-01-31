import { eq } from 'drizzle-orm'
import { users, emailVerificationTokens } from '@nvyt/db'
import { nanoid } from 'nanoid'
import { sendEmail, emailVerificationEmail, accountSetupReminderEmail } from '~/server/utils/email'

export default defineEventHandler(async (event) => {
  const admin = await requireAuth(event)
  requireAdmin(admin.email)

  const db = useDatabase()
  const config = useRuntimeConfig()
  const userId = getRouterParam(event, 'userId')

  if (!userId) {
    throw createError({ statusCode: 400, message: 'User ID is required' })
  }

  // Look up the target user
  const [targetUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!targetUser) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  if (targetUser.emailVerified) {
    throw createError({ statusCode: 400, message: 'Email is already verified' })
  }

  const appUrl = config.public.appUrl as string

  try {
    if (!targetUser.passwordHash) {
      // No password set — send account setup email instead
      const setupToken = await createAccountSetupToken(targetUser.id)

      await sendEmail({
        to: targetUser.email,
        ...accountSetupReminderEmail({
          userName: targetUser.name,
          setupUrl: `${appUrl}/setup-account?token=${setupToken}`,
        }),
      })

      return successResponse({
        message: `Account setup email sent to ${targetUser.email}`,
        type: 'setup',
      })
    }

    // Has password — send verification email
    // Invalidate existing tokens
    await db
      .update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(emailVerificationTokens.userId, targetUser.id))

    // Create new verification token
    const verificationToken = nanoid(32)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    await db.insert(emailVerificationTokens).values({
      userId: targetUser.id,
      token: verificationToken,
      expiresAt,
    })

    await sendEmail({
      to: targetUser.email,
      ...emailVerificationEmail({
        userName: targetUser.name,
        verificationUrl: `${appUrl}/verify-email?token=${verificationToken}`,
      }),
    })

    return successResponse({
      message: `Verification email sent to ${targetUser.email}`,
      type: 'verification',
    })
  } catch (emailError) {
    console.error('[Admin Resend Verification] Failed to send email:', emailError)
    throw createError({
      statusCode: 500,
      message: 'Failed to send email.',
    })
  }
})

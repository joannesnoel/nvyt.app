import { eq } from 'drizzle-orm'
import { users } from '@nvyt/db'
import { resendSetupLinkSchema } from '@nvyt/shared'
import { sendEmail, accountSetupReminderEmail } from '~/server/utils/email'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // Validate input
  const result = resendSetupLinkSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const { email } = result.data
  const db = useDatabase()
  const config = useRuntimeConfig()

  // Find user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1)

  // Always return success to prevent email enumeration
  if (!user) {
    return successResponse({
      message: 'If an account exists with this email and requires setup, a link has been sent.',
    })
  }

  // Only send if user has no password
  if (user.passwordHash) {
    // User has password - they should use forgot password instead
    return successResponse({
      message: 'If an account exists with this email and requires setup, a link has been sent.',
    })
  }

  // Create new setup token
  const setupToken = await createAccountSetupToken(user.id)

  // Send email
  const appUrl = config.public.appUrl as string
  await sendEmail({
    to: user.email,
    ...accountSetupReminderEmail({
      userName: user.name,
      setupUrl: `${appUrl}/setup-account?token=${setupToken}`,
    }),
  })

  return successResponse({
    message: 'If an account exists with this email and requires setup, a link has been sent.',
  })
})

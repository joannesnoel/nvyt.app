import { eq } from 'drizzle-orm'
import { users } from '@nvyt/db'
import { loginSchema } from '@nvyt/shared'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // Validate input
  const result = loginSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const { email, password } = result.data
  const db = useDatabase()

  // Find user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1)

  if (!user || !user.passwordHash) {
    throw createError({
      statusCode: 401,
      message: 'Invalid email or password',
    })
  }

  // Verify password
  const isValid = await verifyPassword(password, user.passwordHash)
  if (!isValid) {
    throw createError({
      statusCode: 401,
      message: 'Invalid email or password',
    })
  }

  // Create session
  const sessionToken = await createSession(event, user)
  const accessToken = await createAccessToken(user)

  return successResponse({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
    },
    accessToken,
    sessionToken,
  })
})

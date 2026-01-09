import { eq } from 'drizzle-orm'
import { users } from '@nvyt/db'
import { registerSchema } from '@nvyt/shared'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // Validate input
  const result = registerSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const { name, email, password } = result.data
  const db = useDatabase()

  // Check if user already exists
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1)

  if (existingUser) {
    throw createError({
      statusCode: 409,
      message: 'An account with this email already exists',
    })
  }

  // Create user
  const passwordHash = await hashPassword(password)
  const [user] = await db
    .insert(users)
    .values({
      name,
      email: email.toLowerCase(),
      passwordHash,
    })
    .returning()

  if (!user) {
    throw createError({
      statusCode: 500,
      message: 'Failed to create user',
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
    },
    accessToken, // For mobile apps
    sessionToken, // For reference (cookie is also set)
  })
})

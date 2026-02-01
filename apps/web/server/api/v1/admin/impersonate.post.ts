import { users } from '@nvyt/db'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const admin = await requireAuth(event)
  requireAdmin(admin.email)

  const { userId } = await readBody<{ userId: string }>(event)
  if (!userId) {
    throw createError({ statusCode: 400, message: 'userId is required' })
  }

  const db = useDatabase()
  const [targetUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!targetUser) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  // Save admin's current session token so we can restore it later
  const currentSessionToken = getCookie(event, 'session')!
  setCookie(event, 'admin-session', currentSessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  })

  // Create a new session as the target user (this also sets the session cookie)
  await createSession(event, targetUser)

  return successResponse({ success: true })
})

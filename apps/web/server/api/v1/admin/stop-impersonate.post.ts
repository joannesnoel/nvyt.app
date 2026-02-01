import { sessions } from '@nvyt/db'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const adminSessionToken = getCookie(event, 'admin-session')
  if (!adminSessionToken) {
    throw createError({ statusCode: 400, message: 'Not currently impersonating' })
  }

  // Delete the impersonated session
  const currentToken = getCookie(event, 'session')
  if (currentToken) {
    const db = useDatabase()
    await db.delete(sessions).where(eq(sessions.token, currentToken))
  }

  // Restore admin session
  setCookie(event, 'session', adminSessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })

  // Clear admin-session cookie
  deleteCookie(event, 'admin-session', { path: '/' })

  return successResponse({ success: true })
})

import { H3Event } from 'h3'
import { eq, and, isNull } from 'drizzle-orm'
import { sessions, users, accountSetupTokens, type User } from '@nvyt/db'
import { SignJWT, jwtVerify } from 'jose'
import { nanoid } from 'nanoid'

const TOKEN_EXPIRY = 60 * 60 * 24 * 7 // 7 days in seconds
const SETUP_TOKEN_EXPIRY = 60 * 60 * 24 * 7 // 7 days in seconds

interface JWTPayload {
  sub: string
  email: string
  iat: number
  exp: number
}

export async function createAccessToken(user: User): Promise<string> {
  const config = useRuntimeConfig()
  const secret = new TextEncoder().encode(config.jwtSecret)

  return await new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret)
}

export async function verifyAccessToken(token: string): Promise<JWTPayload | null> {
  try {
    const config = useRuntimeConfig()
    const secret = new TextEncoder().encode(config.jwtSecret)
    const { payload } = await jwtVerify(token, secret)
    return payload as unknown as JWTPayload
  } catch {
    return null
  }
}

export async function getUserFromEvent(event: H3Event): Promise<User | null> {
  // Try Authorization header first (for mobile apps)
  const authHeader = getHeader(event, 'authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const payload = await verifyAccessToken(token)
    if (payload) {
      const db = useDatabase()
      const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1)
      return user ?? null
    }
  }

  // Try session cookie (for web)
  const sessionToken = getCookie(event, 'session')
  if (sessionToken) {
    const db = useDatabase()
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, sessionToken))
      .limit(1)

    if (session && new Date(session.expiresAt) > new Date()) {
      const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1)
      return user ?? null
    }
  }

  return null
}

export async function requireAuth(event: H3Event): Promise<User> {
  const user = await getUserFromEvent(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'You must be logged in to access this resource',
    })
  }
  return user
}

export async function createSession(event: H3Event, user: User): Promise<string> {
  const db = useDatabase()
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY * 1000)

  await db.insert(sessions).values({
    userId: user.id,
    token,
    expiresAt,
    userAgent: getHeader(event, 'user-agent'),
    ipAddress: getRequestIP(event),
  })

  // Set cookie for web clients
  setCookie(event, 'session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: TOKEN_EXPIRY,
    path: '/',
  })

  return token
}

export async function destroySession(event: H3Event): Promise<void> {
  const sessionToken = getCookie(event, 'session')
  if (sessionToken) {
    const db = useDatabase()
    await db.delete(sessions).where(eq(sessions.token, sessionToken))
    deleteCookie(event, 'session')
  }
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const passwordHash = await hashPassword(password)
  return passwordHash === hash
}

// Account setup token functions for guest checkout
export async function createAccountSetupToken(userId: string): Promise<string> {
  const db = useDatabase()
  const token = nanoid(32)
  const expiresAt = new Date(Date.now() + SETUP_TOKEN_EXPIRY * 1000)

  // Invalidate any existing unused tokens for this user
  await db
    .update(accountSetupTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(accountSetupTokens.userId, userId),
        isNull(accountSetupTokens.usedAt)
      )
    )

  // Create new token
  await db.insert(accountSetupTokens).values({
    userId,
    token,
    expiresAt,
  })

  return token
}

export async function verifyAccountSetupToken(token: string): Promise<{ userId: string; valid: boolean; expired: boolean }> {
  const db = useDatabase()

  const [record] = await db
    .select()
    .from(accountSetupTokens)
    .where(eq(accountSetupTokens.token, token))
    .limit(1)

  if (!record) {
    return { userId: '', valid: false, expired: false }
  }

  if (record.usedAt) {
    return { userId: record.userId, valid: false, expired: false }
  }

  if (new Date(record.expiresAt) < new Date()) {
    return { userId: record.userId, valid: false, expired: true }
  }

  return { userId: record.userId, valid: true, expired: false }
}

export async function markSetupTokenUsed(token: string): Promise<void> {
  const db = useDatabase()

  await db
    .update(accountSetupTokens)
    .set({ usedAt: new Date() })
    .where(eq(accountSetupTokens.token, token))
}

import { pushSubscriptions } from '@nvyt/db'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)
  const { endpoint, keys } = body

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    throw createError({ statusCode: 400, message: 'Invalid push subscription data' })
  }

  const db = useDatabase()

  // Upsert: if endpoint already exists, update keys and user
  const [existing] = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .limit(1)

  if (existing) {
    await db
      .update(pushSubscriptions)
      .set({
        userId: user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: getRequestHeader(event, 'user-agent') || null,
        updatedAt: new Date(),
      })
      .where(eq(pushSubscriptions.endpoint, endpoint))
  } else {
    await db.insert(pushSubscriptions).values({
      userId: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: getRequestHeader(event, 'user-agent') || null,
    })
  }

  return successResponse({ subscribed: true })
})

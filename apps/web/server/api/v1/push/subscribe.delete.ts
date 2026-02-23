import { pushSubscriptions } from '@nvyt/db'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)
  const { endpoint } = body

  if (!endpoint) {
    throw createError({ statusCode: 400, message: 'Endpoint is required' })
  }

  const db = useDatabase()

  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, endpoint),
        eq(pushSubscriptions.userId, user.id),
      ),
    )

  return successResponse({ unsubscribed: true })
})

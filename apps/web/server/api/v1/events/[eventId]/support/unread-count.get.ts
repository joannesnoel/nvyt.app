import { supportConversations } from '@nvyt/db'
import { eq, and, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, message: 'Event ID is required' })
  }

  await requireEventAccess(event, eventId, 'canEdit')

  const db = useDatabase()

  const [result] = await db
    .select({ count: sql<number>`COALESCE(SUM(${supportConversations.unreadBySupport}), 0)` })
    .from(supportConversations)
    .where(eq(supportConversations.eventId, eventId))

  return successResponse({ unreadCount: Number(result?.count ?? 0) })
})

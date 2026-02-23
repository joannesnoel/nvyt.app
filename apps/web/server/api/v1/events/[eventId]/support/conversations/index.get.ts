import { supportConversations } from '@nvyt/db'
import { eq, desc, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, message: 'Event ID is required' })
  }

  await requireEventAccess(event, eventId, 'canEdit')

  const db = useDatabase()
  const query = getQuery(event)
  const page = parseInt(query.page as string) || 1
  const limit = parseInt(query.limit as string) || 20
  const offset = (page - 1) * limit

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(supportConversations)
    .where(eq(supportConversations.eventId, eventId))

  const total = Number(countResult?.count ?? 0)

  const conversations = await db
    .select()
    .from(supportConversations)
    .where(eq(supportConversations.eventId, eventId))
    .orderBy(desc(supportConversations.lastMessageAt))
    .limit(limit)
    .offset(offset)

  return paginatedResponse(conversations, page, limit, total)
})

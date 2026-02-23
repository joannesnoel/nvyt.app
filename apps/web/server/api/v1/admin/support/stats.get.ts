import { supportConversations } from '@nvyt/db'
import { eq, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  requireAdmin(user.email)

  const db = useDatabase()

  const stats = await db
    .select({
      status: supportConversations.status,
      count: sql<number>`count(*)`,
    })
    .from(supportConversations)
    .groupBy(supportConversations.status)

  const result: Record<string, number> = {
    open: 0,
    waiting_on_visitor: 0,
    waiting_on_support: 0,
    resolved: 0,
    closed: 0,
  }

  for (const row of stats) {
    result[row.status] = Number(row.count)
  }

  const totalUnread = await db
    .select({ count: sql<number>`COALESCE(SUM(${supportConversations.unreadBySupport}), 0)` })
    .from(supportConversations)

  return successResponse({
    ...result,
    totalUnread: Number(totalUnread[0]?.count ?? 0),
    total: Object.values(result).reduce((a, b) => a + b, 0),
  })
})

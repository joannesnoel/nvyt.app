import { supportConversations, events, users } from '@nvyt/db'
import { eq, desc, and, ilike, or, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  requireAdmin(user.email)

  const query = getQuery(event)
  const status = query.status as string | undefined
  const eventId = query.eventId as string | undefined
  const search = query.search as string | undefined
  const assignedToMe = query.assignedToMe === 'true'
  const page = parseInt(query.page as string) || 1
  const limit = parseInt(query.limit as string) || 20
  const offset = (page - 1) * limit

  const db = useDatabase()

  // Build conditions
  const conditions = []
  if (status) {
    conditions.push(eq(supportConversations.status, status as any))
  }
  if (eventId) {
    conditions.push(eq(supportConversations.eventId, eventId))
  }
  if (assignedToMe) {
    conditions.push(eq(supportConversations.assigneeId, user.id))
  }
  if (search) {
    conditions.push(
      or(
        ilike(supportConversations.visitorName, `%${search}%`),
        ilike(supportConversations.visitorEmail, `%${search}%`),
        ilike(supportConversations.subject, `%${search}%`),
        ilike(supportConversations.lastMessagePreview, `%${search}%`)
      )
    )
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  // Count total
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(supportConversations)
    .where(whereClause)

  const total = Number(countResult?.count ?? 0)

  // Fetch conversations with event title
  const conversations = await db
    .select({
      conversation: supportConversations,
      eventTitle: events.title,
      assigneeName: users.name,
    })
    .from(supportConversations)
    .leftJoin(events, eq(supportConversations.eventId, events.id))
    .leftJoin(users, eq(supportConversations.assigneeId, users.id))
    .where(whereClause)
    .orderBy(desc(supportConversations.lastMessageAt))
    .limit(limit)
    .offset(offset)

  const data = conversations.map((row) => ({
    ...row.conversation,
    eventTitle: row.eventTitle,
    assigneeName: row.assigneeName,
  }))

  return paginatedResponse(data, page, limit, total)
})

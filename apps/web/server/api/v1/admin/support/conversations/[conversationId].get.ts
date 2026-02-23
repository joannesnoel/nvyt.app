import { supportConversations, supportMessages, events } from '@nvyt/db'
import { eq, asc, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  requireAdmin(user.email)

  const conversationId = getRouterParam(event, 'conversationId')
  if (!conversationId) {
    throw createError({ statusCode: 400, message: 'Conversation ID is required' })
  }

  const db = useDatabase()

  const [row] = await db
    .select({
      conversation: supportConversations,
      eventTitle: events.title,
    })
    .from(supportConversations)
    .leftJoin(events, eq(supportConversations.eventId, events.id))
    .where(eq(supportConversations.id, conversationId))
    .limit(1)

  if (!row) {
    throw createError({ statusCode: 404, message: 'Conversation not found' })
  }

  const messages = await db
    .select()
    .from(supportMessages)
    .where(eq(supportMessages.conversationId, conversationId))
    .orderBy(asc(supportMessages.createdAt))

  // Mark messages as read by support
  await db
    .update(supportMessages)
    .set({ readBySupport: true })
    .where(
      and(
        eq(supportMessages.conversationId, conversationId),
        eq(supportMessages.readBySupport, false)
      )
    )

  await db
    .update(supportConversations)
    .set({ unreadBySupport: 0, updatedAt: new Date() })
    .where(eq(supportConversations.id, conversationId))

  return successResponse({
    ...row.conversation,
    eventTitle: row.eventTitle,
    messages,
  })
})

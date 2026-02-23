import { supportConversations, supportMessages } from '@nvyt/db'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const conversationId = getRouterParam(event, 'conversationId')
  const body = await readBody(event)

  if (!conversationId) {
    throw createError({ statusCode: 400, message: 'Conversation ID is required' })
  }

  const { visitorToken } = body
  if (!visitorToken) {
    throw createError({ statusCode: 400, message: 'Visitor token is required' })
  }

  const db = useDatabase()

  // Verify ownership
  const [conversation] = await db
    .select()
    .from(supportConversations)
    .where(eq(supportConversations.id, conversationId))
    .limit(1)

  if (!conversation || conversation.visitorToken !== visitorToken) {
    throw createError({ statusCode: 404, message: 'Conversation not found' })
  }

  // Mark all messages as read by visitor
  await db
    .update(supportMessages)
    .set({ readByVisitor: true })
    .where(
      and(
        eq(supportMessages.conversationId, conversationId),
        eq(supportMessages.readByVisitor, false)
      )
    )

  // Reset unread count
  await db
    .update(supportConversations)
    .set({ unreadByVisitor: 0, updatedAt: new Date() })
    .where(eq(supportConversations.id, conversationId))

  return successResponse({ success: true })
})

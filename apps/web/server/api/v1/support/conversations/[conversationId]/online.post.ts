import { supportConversations } from '@nvyt/db'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const conversationId = getRouterParam(event, 'conversationId')
  const body = await readBody(event)

  if (!conversationId) {
    throw createError({ statusCode: 400, message: 'Conversation ID is required' })
  }

  const { visitorToken, online } = body
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

  const isOnline = online !== false
  await db
    .update(supportConversations)
    .set({
      visitorOnline: isOnline,
      lastHeartbeatAt: isOnline ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(supportConversations.id, conversationId))

  return successResponse({ success: true })
})

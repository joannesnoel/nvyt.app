import { supportConversations, supportMessages } from '@nvyt/db'
import { eq, asc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')

  if (!token) {
    throw createError({ statusCode: 400, message: 'Token is required' })
  }

  const db = useDatabase()

  const [conversation] = await db
    .select()
    .from(supportConversations)
    .where(eq(supportConversations.visitorToken, token))
    .limit(1)

  if (!conversation) {
    return successResponse(null)
  }

  const messages = await db
    .select()
    .from(supportMessages)
    .where(eq(supportMessages.conversationId, conversation.id))
    .orderBy(asc(supportMessages.createdAt))

  return successResponse({ conversation, messages })
})

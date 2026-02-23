import { supportConversations, supportMessages } from '@nvyt/db'
import { eq, asc, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const conversationId = getRouterParam(event, 'conversationId')

  if (!eventId || !conversationId) {
    throw createError({ statusCode: 400, message: 'Event ID and Conversation ID are required' })
  }

  await requireEventAccess(event, eventId, 'canEdit')

  const db = useDatabase()

  const [conversation] = await db
    .select()
    .from(supportConversations)
    .where(
      and(
        eq(supportConversations.id, conversationId),
        eq(supportConversations.eventId, eventId)
      )
    )
    .limit(1)

  if (!conversation) {
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

  return successResponse({ ...conversation, messages })
})

import { supportConversations } from '@nvyt/db'
import { updateConversationSchema } from '@nvyt/shared'
import { eq } from 'drizzle-orm'
import { broadcastConversationUpdated } from '~/server/utils/pusher'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  requireAdmin(user.email)

  const conversationId = getRouterParam(event, 'conversationId')
  if (!conversationId) {
    throw createError({ statusCode: 400, message: 'Conversation ID is required' })
  }

  const body = await readBody(event)
  const result = updateConversationSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const data = result.data
  const db = useDatabase()

  const [conversation] = await db
    .select()
    .from(supportConversations)
    .where(eq(supportConversations.id, conversationId))
    .limit(1)

  if (!conversation) {
    throw createError({ statusCode: 404, message: 'Conversation not found' })
  }

  const updates: Record<string, any> = { updatedAt: new Date() }
  if (data.status !== undefined) updates.status = data.status
  if (data.assigneeId !== undefined) updates.assigneeId = data.assigneeId

  const [updated] = await db
    .update(supportConversations)
    .set(updates)
    .where(eq(supportConversations.id, conversationId))
    .returning()

  await broadcastConversationUpdated({
    conversationId,
    eventId: conversation.eventId,
    updates: data,
  })

  return successResponse(updated)
})

import { supportConversations, supportMessages } from '@nvyt/db'
import { sendMessageSchema } from '@nvyt/shared'
import { eq, sql } from 'drizzle-orm'
import { broadcastSupportMessage } from '~/server/utils/pusher'

export default defineEventHandler(async (event) => {
  const conversationId = getRouterParam(event, 'conversationId')
  const body = await readBody(event)

  if (!conversationId) {
    throw createError({ statusCode: 400, message: 'Conversation ID is required' })
  }

  const { visitorToken, content, attachments } = body

  if (!visitorToken) {
    throw createError({ statusCode: 400, message: 'Visitor token is required' })
  }

  if (!content && (!attachments || attachments.length === 0)) {
    throw createError({ statusCode: 400, message: 'Message content or attachments required' })
  }

  const db = useDatabase()

  // Verify conversation belongs to this visitor
  const [conversation] = await db
    .select()
    .from(supportConversations)
    .where(eq(supportConversations.id, conversationId))
    .limit(1)

  if (!conversation || conversation.visitorToken !== visitorToken) {
    throw createError({ statusCode: 404, message: 'Conversation not found' })
  }

  const user = await getUserFromEvent(event)
  const preview = content ? content.substring(0, 100) : '[Attachment]'

  // Create message
  const [message] = await db
    .insert(supportMessages)
    .values({
      conversationId,
      senderType: 'visitor',
      senderId: user?.id ?? null,
      senderName: conversation.visitorName,
      content: content || null,
      attachments: attachments || null,
      readByVisitor: true,
    })
    .returning()

  // Update conversation atomically
  await db
    .update(supportConversations)
    .set({
      status: 'waiting_on_support',
      lastMessageAt: new Date(),
      lastMessagePreview: preview,
      unreadBySupport: sql`${supportConversations.unreadBySupport} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(supportConversations.id, conversationId))

  await broadcastSupportMessage({
    conversationId,
    eventId: conversation.eventId,
    message,
  })

  // Push notification to assigned admin/organizer, or all admins if unassigned
  const pushPayload = {
    title: `Support: ${conversation.visitorName}`,
    body: (content || 'Sent an attachment').substring(0, 100),
    url: '/admin/support',
    tag: `support-${conversationId}`,
  }
  if (conversation.assigneeId) {
    sendPushToUser(conversation.assigneeId, pushPayload)
      .catch(err => console.error('[Support] Failed to send push notification:', err))
  } else {
    sendPushToAdmins(pushPayload)
      .catch(err => console.error('[Support] Failed to send push to admins:', err))
  }

  return successResponse(message)
})

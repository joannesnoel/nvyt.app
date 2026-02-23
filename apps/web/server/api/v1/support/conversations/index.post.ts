import { supportConversations, supportMessages } from '@nvyt/db'
import { createConversationSchema } from '@nvyt/shared'
import { eq, and, notInArray } from 'drizzle-orm'
import { broadcastSupportMessage, broadcastNewConversation } from '~/server/utils/pusher'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const result = createConversationSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const data = result.data
  const db = useDatabase()

  // Check if visitor already has an active (non-closed/resolved) conversation
  const existing = await db
    .select()
    .from(supportConversations)
    .where(
      and(
        eq(supportConversations.visitorToken, data.visitorToken),
        notInArray(supportConversations.status, ['resolved', 'closed'])
      )
    )
    .limit(1)

  if (existing.length > 0) {
    throw createError({
      statusCode: 409,
      message: 'You already have an active conversation',
    })
  }

  // Optionally associate with logged-in user
  const user = await getUserFromEvent(event)
  const preview = data.message.substring(0, 100)

  // Create conversation
  const [conversation] = await db
    .insert(supportConversations)
    .values({
      visitorToken: data.visitorToken,
      userId: user?.id ?? null,
      visitorName: data.visitorName,
      visitorEmail: data.visitorEmail || null,
      eventId: data.eventId ?? null,
      subject: data.subject ?? null,
      status: 'waiting_on_support',
      lastMessageAt: new Date(),
      lastMessagePreview: preview,
      unreadBySupport: 1,
      visitorOnline: true,
    })
    .returning()

  if (!conversation) {
    throw createError({ statusCode: 500, message: 'Failed to create conversation' })
  }

  // Create first message
  const [message] = await db
    .insert(supportMessages)
    .values({
      conversationId: conversation.id,
      senderType: 'visitor',
      senderId: user?.id ?? null,
      senderName: data.visitorName,
      content: data.message,
      readByVisitor: true,
    })
    .returning()

  // Broadcast in real-time
  await broadcastNewConversation({ conversation })
  await broadcastSupportMessage({
    conversationId: conversation.id,
    eventId: conversation.eventId,
    message,
  })

  // Push notification to all admins for new conversation
  sendPushToAdmins({
    title: `New Support: ${data.visitorName}`,
    body: data.message.substring(0, 100),
    url: '/admin/support',
    tag: `support-new-${conversation.id}`,
  }).catch(err => console.error('[Support] Failed to send push to admins:', err))

  return successResponse({ conversation, messages: [message] })
})

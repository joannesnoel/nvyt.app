import { supportConversations, supportMessages, events } from '@nvyt/db'
import { eq, and, sql } from 'drizzle-orm'
import { broadcastSupportMessage, broadcastConversationUpdated } from '~/server/utils/pusher'
import { sendEmail, supportReplyNotificationEmail } from '~/server/utils/email'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const conversationId = getRouterParam(event, 'conversationId')

  if (!eventId || !conversationId) {
    throw createError({ statusCode: 400, message: 'Event ID and Conversation ID are required' })
  }

  const { user } = await requireEventAccess(event, eventId, 'canEdit')

  const body = await readBody(event)
  const { content, attachments } = body

  if (!content && (!attachments || attachments.length === 0)) {
    throw createError({ statusCode: 400, message: 'Message content or attachments required' })
  }

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

  const preview = content ? content.substring(0, 100) : '[Attachment]'

  const [message] = await db
    .insert(supportMessages)
    .values({
      conversationId,
      senderType: 'organizer',
      senderId: user.id,
      senderName: user.name,
      content: content || null,
      attachments: attachments || null,
      readBySupport: true,
    })
    .returning()

  if (!message) {
    throw createError({ statusCode: 500, message: 'Failed to create message' })
  }

  await db
    .update(supportConversations)
    .set({
      status: 'waiting_on_visitor',
      lastMessageAt: new Date(),
      lastMessagePreview: preview,
      unreadByVisitor: sql`${supportConversations.unreadByVisitor} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(supportConversations.id, conversationId))

  await broadcastSupportMessage({
    conversationId,
    eventId,
    message,
  })
  await broadcastConversationUpdated({
    conversationId,
    eventId,
    updates: { status: 'waiting_on_visitor' },
  })

  // Email notification if visitor is offline and has email
  // Visitor is considered online only if heartbeat was received within the last 2 minutes
  const HEARTBEAT_STALE_MS = 2 * 60 * 1000
  const isVisitorOnline = conversation.lastHeartbeatAt
    && (Date.now() - new Date(conversation.lastHeartbeatAt).getTime()) < HEARTBEAT_STALE_MS

  if (!isVisitorOnline && conversation.visitorEmail) {
    try {
      let eventTitle: string | undefined
      const [evt] = await db
        .select({ title: events.title })
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1)
      eventTitle = evt?.title

      const config = useRuntimeConfig()
      const appUrl = config.public.appUrl as string
      const resumeUrl = `${appUrl}/support/chat?token=${conversation.visitorToken}`

      const emailData = supportReplyNotificationEmail({
        visitorName: conversation.visitorName,
        responderName: user.name,
        messagePreview: content || 'Sent an attachment',
        resumeUrl,
        eventTitle,
      })

      await sendEmail({
        to: conversation.visitorEmail,
        subject: emailData.subject,
        html: emailData.html,
      })

      await db
        .update(supportMessages)
        .set({ emailNotificationSent: true })
        .where(eq(supportMessages.id, message.id))
    } catch (error) {
      console.error('[Support] Failed to send email notification:', error)
    }
  }

  return successResponse(message)
})

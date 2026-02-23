import { supportConversations } from '@nvyt/db'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')

  if (!token) {
    throw createError({ statusCode: 400, message: 'Token is required' })
  }

  const db = useDatabase()

  const [conversation] = await db
    .select({ id: supportConversations.id })
    .from(supportConversations)
    .where(eq(supportConversations.visitorToken, token))
    .limit(1)

  if (!conversation) {
    throw createError({ statusCode: 404, message: 'Conversation not found' })
  }

  // Redirect to chat page with token
  return sendRedirect(event, `/support/chat?token=${token}`)
})

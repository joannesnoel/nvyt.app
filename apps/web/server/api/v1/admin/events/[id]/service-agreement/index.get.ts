import { eq } from 'drizzle-orm'
import { serviceAgreements } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  requireAdmin(user.email)

  const eventId = getRouterParam(event, 'id')
  if (!eventId) {
    throw createError({ statusCode: 400, message: 'Event ID is required' })
  }

  const db = useDatabase()

  const [agreement] = await db
    .select()
    .from(serviceAgreements)
    .where(eq(serviceAgreements.eventId, eventId))
    .limit(1)

  return successResponse(agreement || null)
})

import { eq, and } from 'drizzle-orm'
import { serviceAgreements } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, message: 'Event ID is required' })
  }

  // Require at least basic event access (owner or collaborator)
  await requireEventAccess(event, eventId)

  const db = useDatabase()

  const [agreement] = await db
    .select()
    .from(serviceAgreements)
    .where(
      and(
        eq(serviceAgreements.eventId, eventId),
        eq(serviceAgreements.status, 'published')
      )
    )
    .limit(1)

  if (!agreement) {
    return successResponse(null)
  }

  return successResponse(agreement)
})

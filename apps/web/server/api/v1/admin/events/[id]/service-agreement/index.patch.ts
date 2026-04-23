import { eq } from 'drizzle-orm'
import { serviceAgreements } from '@nvyt/db'
import { z } from 'zod'

const updateSchema = z.object({
  content: z.string().min(1).optional(),
  status: z.enum(['draft', 'published']).optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  requireAdmin(user.email)

  const eventId = getRouterParam(event, 'id')
  if (!eventId) {
    throw createError({ statusCode: 400, message: 'Event ID is required' })
  }

  const body = await readBody(event)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: parsed.error.errors[0]?.message || 'Invalid input' })
  }

  const db = useDatabase()

  const [existing] = await db
    .select()
    .from(serviceAgreements)
    .where(eq(serviceAgreements.eventId, eventId))
    .limit(1)

  if (!existing) {
    throw createError({ statusCode: 404, message: 'Service agreement not found. Generate one first.' })
  }

  const [agreement] = await db
    .update(serviceAgreements)
    .set({
      ...parsed.data,
      updatedAt: new Date(),
    })
    .where(eq(serviceAgreements.eventId, eventId))
    .returning()

  return successResponse(agreement)
})

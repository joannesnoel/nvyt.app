import { ticketTypes, events } from '@nvyt/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const reorderSchema = z.object({
  ticketTypeIds: z.array(z.string().uuid()).min(1),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const eventId = getRouterParam(event, 'eventId')
  const body = await readBody(event)

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  const db = useDatabase()

  // Verify event exists and user owns it
  const [eventRecord] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)

  if (!eventRecord) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  if (eventRecord.organizerId !== user.id) {
    throw createError({
      statusCode: 403,
      message: 'You are not authorized to manage this event',
    })
  }

  // Validate input
  const result = reorderSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const { ticketTypeIds } = result.data

  // Update sort order for each ticket type
  for (let i = 0; i < ticketTypeIds.length; i++) {
    const ticketTypeId = ticketTypeIds[i]
    if (ticketTypeId) {
      await db
        .update(ticketTypes)
        .set({
          sortOrder: i,
          updatedAt: new Date(),
        })
        .where(eq(ticketTypes.id, ticketTypeId))
    }
  }

  // Return updated list
  const updatedTypes = await db
    .select()
    .from(ticketTypes)
    .where(eq(ticketTypes.eventId, eventId))
    .orderBy(ticketTypes.sortOrder)

  return successResponse(updatedTypes)
})

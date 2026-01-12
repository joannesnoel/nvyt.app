import { ticketTypes, events } from '@nvyt/db'
import { ticketTypeStatus } from '@nvyt/shared'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'

const updateStatusSchema = z.object({
  status: ticketTypeStatus,
})

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const ticketTypeId = getRouterParam(event, 'ticketTypeId')
  const body = await readBody(event)

  if (!eventId || !ticketTypeId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID and Ticket Type ID are required',
    })
  }

  // Require canManageTickets permission (owner or collaborator)
  await requireEventAccess(event, eventId, 'canManageTickets')

  const db = useDatabase()

  // Verify ticket type exists
  const [existingTicketType] = await db
    .select()
    .from(ticketTypes)
    .where(and(eq(ticketTypes.id, ticketTypeId), eq(ticketTypes.eventId, eventId)))
    .limit(1)

  if (!existingTicketType) {
    throw createError({
      statusCode: 404,
      message: 'Ticket type not found',
    })
  }

  // Validate input
  const result = updateStatusSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const { status } = result.data

  // Update status
  const [updatedTicketType] = await db
    .update(ticketTypes)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(ticketTypes.id, ticketTypeId))
    .returning()

  return successResponse(updatedTicketType)
})

import { ticketTypes, tickets, events } from '@nvyt/db'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const ticketTypeId = getRouterParam(event, 'ticketTypeId')

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

  // Check if any tickets have been sold
  if (existingTicketType.quantitySold > 0) {
    throw createError({
      statusCode: 400,
      message: `Cannot delete ticket type with ${existingTicketType.quantitySold} sold tickets. Disable it instead.`,
    })
  }

  // Check for any pending tickets (just in case)
  const [ticketCount] = await db
    .select({ count: tickets.id })
    .from(tickets)
    .where(eq(tickets.ticketTypeId, ticketTypeId))
    .limit(1)

  if (ticketCount) {
    throw createError({
      statusCode: 400,
      message: 'Cannot delete ticket type with associated tickets. Disable it instead.',
    })
  }

  // Delete ticket type
  await db.delete(ticketTypes).where(eq(ticketTypes.id, ticketTypeId))

  return successResponse({ message: 'Ticket type deleted successfully' })
})

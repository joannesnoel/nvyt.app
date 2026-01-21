import { ticketTypes, ticketPriceTiers } from '@nvyt/db'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const ticketTypeId = getRouterParam(event, 'ticketTypeId')
  const tierId = getRouterParam(event, 'tierId')

  if (!eventId || !ticketTypeId || !tierId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID, Ticket Type ID, and Tier ID are required',
    })
  }

  // Require canManageTickets permission
  await requireEventAccess(event, eventId, 'canManageTickets')

  const db = useDatabase()

  // Verify ticket type exists and belongs to this event
  const [ticketType] = await db
    .select()
    .from(ticketTypes)
    .where(eq(ticketTypes.id, ticketTypeId))
    .limit(1)

  if (!ticketType || ticketType.eventId !== eventId) {
    throw createError({
      statusCode: 404,
      message: 'Ticket type not found',
    })
  }

  // Verify tier exists and belongs to this ticket type
  const [existingTier] = await db
    .select()
    .from(ticketPriceTiers)
    .where(
      and(
        eq(ticketPriceTiers.id, tierId),
        eq(ticketPriceTiers.ticketTypeId, ticketTypeId)
      )
    )
    .limit(1)

  if (!existingTier) {
    throw createError({
      statusCode: 404,
      message: 'Price tier not found',
    })
  }

  // Delete the price tier
  await db
    .delete(ticketPriceTiers)
    .where(eq(ticketPriceTiers.id, tierId))

  return successResponse({ message: 'Price tier deleted successfully' })
})

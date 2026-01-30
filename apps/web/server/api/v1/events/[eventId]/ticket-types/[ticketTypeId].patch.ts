import { ticketTypes } from '@nvyt/db'
import { updateTicketTypeSchema } from '@nvyt/shared'
import { eq, and } from 'drizzle-orm'
import { unpublishIfUnverified } from '~/server/utils/eventVerification'

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
  const result = updateTicketTypeSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const data = result.data

  // Prevent reducing quantity below already sold
  if (data.quantity !== undefined && data.quantity < existingTicketType.quantitySold) {
    throw createError({
      statusCode: 400,
      message: `Cannot reduce quantity below already sold amount (${existingTicketType.quantitySold})`,
    })
  }

  // If setting price > 0, unpublish the event if not verified
  if (data.price !== undefined && data.price > 0) {
    await unpublishIfUnverified(eventId)
  }

  // Build update object
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  }

  if (data.name !== undefined) updateData.name = data.name
  if (data.description !== undefined) updateData.description = data.description
  if (data.price !== undefined) updateData.price = String(data.price)
  if (data.quantity !== undefined) updateData.quantity = data.quantity
  if (data.salesStart !== undefined) updateData.salesStart = data.salesStart ? new Date(data.salesStart) : null
  if (data.salesEnd !== undefined) updateData.salesEnd = data.salesEnd ? new Date(data.salesEnd) : null
  if (data.maxPerOrder !== undefined) updateData.maxPerOrder = data.maxPerOrder
  if (data.minPerOrder !== undefined) updateData.minPerOrder = data.minPerOrder
  if (data.showAvailability !== undefined) updateData.showAvailability = data.showAvailability
  if (data.showNextTierPrice !== undefined) updateData.showNextTierPrice = data.showNextTierPrice

  // Update ticket type
  const [updatedTicketType] = await db
    .update(ticketTypes)
    .set(updateData)
    .where(eq(ticketTypes.id, ticketTypeId))
    .returning()

  return successResponse(updatedTicketType)
})

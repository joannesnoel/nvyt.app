import { ticketTypes, ticketPriceTiers } from '@nvyt/db'
import { updatePriceTierSchema } from '@nvyt/shared'
import { eq, and } from 'drizzle-orm'
import { checkTierOverlap } from '~/server/utils/pricing'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const ticketTypeId = getRouterParam(event, 'ticketTypeId')
  const tierId = getRouterParam(event, 'tierId')
  const body = await readBody(event)

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

  // Validate input
  const result = updatePriceTierSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const data = result.data

  // Determine dates for overlap check
  const startDate = data.startDate ? new Date(data.startDate) : existingTier.startDate
  const endDate = data.endDate ? new Date(data.endDate) : existingTier.endDate

  // Check for overlapping tiers (excluding the current tier)
  const hasOverlap = await checkTierOverlap(ticketTypeId, startDate, endDate, tierId)
  if (hasOverlap) {
    throw createError({
      statusCode: 400,
      message: 'Price tier dates overlap with an existing tier. Please adjust the dates.',
    })
  }

  // Update the price tier
  const updateData: Record<string, any> = {
    updatedAt: new Date(),
  }

  if (data.name !== undefined) updateData.name = data.name
  if (data.price !== undefined) updateData.price = String(data.price)
  if (data.startDate !== undefined) updateData.startDate = new Date(data.startDate)
  if (data.endDate !== undefined) updateData.endDate = new Date(data.endDate)
  if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder

  const [updatedTier] = await db
    .update(ticketPriceTiers)
    .set(updateData)
    .where(eq(ticketPriceTiers.id, tierId))
    .returning()

  if (!updatedTier) {
    throw createError({
      statusCode: 500,
      message: 'Failed to update price tier',
    })
  }

  return successResponse(updatedTier)
})

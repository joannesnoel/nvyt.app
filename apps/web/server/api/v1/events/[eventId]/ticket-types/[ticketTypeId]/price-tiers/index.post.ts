import { ticketTypes, ticketPriceTiers } from '@nvyt/db'
import { createPriceTierSchema } from '@nvyt/shared'
import { eq } from 'drizzle-orm'
import { checkTierOverlap, type PriceTierType } from '~/server/utils/pricing'
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

  // Validate input
  const result = createPriceTierSchema.safeParse({ ...body, ticketTypeId })
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const data = result.data
  const tierType = (data.tierType || 'time') as PriceTierType
  const startDate = data.startDate ? new Date(data.startDate) : null
  const endDate = data.endDate ? new Date(data.endDate) : null

  // Check for overlapping tiers (only for time-based and hybrid tiers)
  if (tierType === 'time' || tierType === 'hybrid') {
    const hasOverlap = await checkTierOverlap(ticketTypeId, startDate, endDate, undefined, tierType)
    if (hasOverlap) {
      throw createError({
        statusCode: 400,
        message: 'Price tier dates overlap with an existing tier. Please adjust the dates.',
      })
    }
  }

  // If adding a paid price tier, unpublish the event if not verified
  if (data.price > 0) {
    await unpublishIfUnverified(eventId)
  }

  // Create the price tier
  const [newTier] = await db
    .insert(ticketPriceTiers)
    .values({
      ticketTypeId,
      name: data.name,
      price: String(data.price),
      tierType,
      startDate,
      endDate,
      quantityLimit: data.quantityLimit ?? null,
      quantitySold: 0,
      sortOrder: data.sortOrder ?? 0,
    })
    .returning()

  if (!newTier) {
    throw createError({
      statusCode: 500,
      message: 'Failed to create price tier',
    })
  }

  return successResponse(newTier)
})

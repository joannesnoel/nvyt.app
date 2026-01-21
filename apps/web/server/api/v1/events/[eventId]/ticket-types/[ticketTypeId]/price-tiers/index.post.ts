import { ticketTypes, ticketPriceTiers } from '@nvyt/db'
import { createPriceTierSchema } from '@nvyt/shared'
import { eq } from 'drizzle-orm'
import { checkTierOverlap } from '~/server/utils/pricing'

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
  const startDate = new Date(data.startDate)
  const endDate = new Date(data.endDate)

  // Check for overlapping tiers
  const hasOverlap = await checkTierOverlap(ticketTypeId, startDate, endDate)
  if (hasOverlap) {
    throw createError({
      statusCode: 400,
      message: 'Price tier dates overlap with an existing tier. Please adjust the dates.',
    })
  }

  // Create the price tier
  const [newTier] = await db
    .insert(ticketPriceTiers)
    .values({
      ticketTypeId,
      name: data.name,
      price: String(data.price),
      startDate,
      endDate,
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

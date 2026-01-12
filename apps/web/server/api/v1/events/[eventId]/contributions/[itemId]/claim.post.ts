import { contributionItems, contributionClaims, attendees, events } from '@nvyt/db'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'

const claimSchema = z.object({
  quantity: z.number().int().positive().default(1),
  notes: z.string().max(500).optional(),
})

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const itemId = getRouterParam(event, 'itemId')
  const body = await readBody(event)

  if (!eventId || !itemId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID and Item ID are required',
    })
  }

  // Require authentication
  const user = await requireAuth(event)

  const db = useDatabase()

  // Check event exists and has contributions enabled
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

  if (!eventRecord.contributionsEnabled) {
    throw createError({
      statusCode: 400,
      message: 'Contributions are not enabled for this event',
    })
  }

  // Check user is a confirmed attendee of the event
  const [attendee] = await db
    .select()
    .from(attendees)
    .where(
      and(
        eq(attendees.eventId, eventId),
        eq(attendees.userId, user.id),
        eq(attendees.status, 'confirmed')
      )
    )
    .limit(1)

  if (!attendee) {
    throw createError({
      statusCode: 403,
      message: 'You must be a confirmed attendee to claim contributions',
    })
  }

  // Check contribution item exists
  const [item] = await db
    .select()
    .from(contributionItems)
    .where(
      and(
        eq(contributionItems.id, itemId),
        eq(contributionItems.eventId, eventId)
      )
    )
    .limit(1)

  if (!item) {
    throw createError({
      statusCode: 404,
      message: 'Contribution item not found',
    })
  }

  // Validate input
  const result = claimSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const { quantity, notes } = result.data

  // Check if user already has a claim for this item
  const [existingClaim] = await db
    .select()
    .from(contributionClaims)
    .where(
      and(
        eq(contributionClaims.contributionItemId, itemId),
        eq(contributionClaims.userId, user.id)
      )
    )
    .limit(1)

  if (existingClaim) {
    throw createError({
      statusCode: 400,
      message: 'You have already claimed this item. Update or remove your existing claim first.',
    })
  }

  // Check if claim quantity is available
  const remaining = item.quantityNeeded - item.quantityClaimed
  if (quantity > remaining) {
    throw createError({
      statusCode: 400,
      message: `Only ${remaining} more needed. Please reduce your quantity.`,
    })
  }

  // Create claim and update item's claimed count in a transaction
  const [newClaim] = await db
    .insert(contributionClaims)
    .values({
      contributionItemId: itemId,
      userId: user.id,
      quantity,
      notes,
    })
    .returning()

  // Update claimed count on the item
  await db
    .update(contributionItems)
    .set({
      quantityClaimed: item.quantityClaimed + quantity,
      updatedAt: new Date(),
    })
    .where(eq(contributionItems.id, itemId))

  return successResponse({
    ...newClaim,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
  })
})

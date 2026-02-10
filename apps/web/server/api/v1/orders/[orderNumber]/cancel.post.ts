import { orders, tickets, ticketTypes, discountCodes } from '@nvyt/db'
import { eq, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const orderNumber = getRouterParam(event, 'orderNumber')

  if (!orderNumber) {
    throw createError({
      statusCode: 400,
      message: 'Order number is required',
    })
  }

  const db = useDatabase()

  // Require authenticated user
  const user = await getUserFromEvent(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'Authentication required',
    })
  }

  // Get order
  const [result] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      userId: orders.userId,
      paymentStatus: orders.paymentStatus,
      discountCodeId: orders.discountCodeId,
    })
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1)

  if (!result) {
    throw createError({
      statusCode: 404,
      message: 'Order not found',
    })
  }

  // Verify the user owns this order
  if (result.userId !== user.id) {
    throw createError({
      statusCode: 403,
      message: 'You are not authorized to cancel this order',
    })
  }

  // Only allow cancellation for pending orders
  if (result.paymentStatus !== 'pending') {
    throw createError({
      statusCode: 400,
      message: 'Only pending orders can be cancelled',
    })
  }

  // Get tickets to release quantity sold counts
  const orderTickets = await db
    .select({ ticketTypeId: tickets.ticketTypeId })
    .from(tickets)
    .where(eq(tickets.orderId, result.id))

  // Decrement quantitySold for each ticket type
  const ticketTypeCountMap = new Map<string, number>()
  for (const t of orderTickets) {
    ticketTypeCountMap.set(t.ticketTypeId, (ticketTypeCountMap.get(t.ticketTypeId) || 0) + 1)
  }
  for (const [ttId, count] of ticketTypeCountMap) {
    await db
      .update(ticketTypes)
      .set({
        quantitySold: sql`GREATEST(${ticketTypes.quantitySold} - ${count}, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(ticketTypes.id, ttId))
  }

  // Cancel tickets
  await db
    .update(tickets)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(tickets.orderId, result.id))

  // Mark order as failed
  await db
    .update(orders)
    .set({ paymentStatus: 'failed', updatedAt: new Date() })
    .where(eq(orders.id, result.id))

  // Decrement discount code usage if applicable
  if (result.discountCodeId) {
    await db
      .update(discountCodes)
      .set({
        usageCount: sql`GREATEST(${discountCodes.usageCount} - 1, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(discountCodes.id, result.discountCodeId))
  }

  console.log(`[Cancel Order] User ${user.id} cancelled order ${orderNumber}`)

  return successResponse({ message: 'Order cancelled' })
})

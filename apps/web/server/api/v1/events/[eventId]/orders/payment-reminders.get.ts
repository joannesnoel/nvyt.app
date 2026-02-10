import { eq, and, notExists, desc } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { orders } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  await requireEventAccess(event, eventId, 'canViewAnalytics')

  const db = useDatabase()

  // Alias for the correlated subquery
  const paidOrders = alias(orders, 'paid_orders')

  // Find pending orders where the user does NOT have a separate paid order for this event
  const allEligible = await db
    .select({
      orderNumber: orders.orderNumber,
      customerName: orders.customerName,
      customerEmail: orders.customerEmail,
      totalAmount: orders.totalAmount,
    })
    .from(orders)
    .where(
      and(
        eq(orders.eventId, eventId),
        eq(orders.paymentStatus, 'pending'),
        notExists(
          db
            .select({ id: paidOrders.id })
            .from(paidOrders)
            .where(
              and(
                eq(paidOrders.eventId, eventId),
                eq(paidOrders.userId, orders.userId),
                eq(paidOrders.paymentStatus, 'paid')
              )
            )
        )
      )
    )
    .orderBy(desc(orders.createdAt))

  // Deduplicate: one reminder per customer email (keep the most recent order)
  const seen = new Set<string>()
  const eligibleOrders = allEligible.filter((o) => {
    const key = o.customerEmail.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return successResponse({
    count: eligibleOrders.length,
    orders: eligibleOrders,
  })
})

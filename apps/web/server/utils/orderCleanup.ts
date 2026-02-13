import { orders, tickets, ticketTypes, ticketPriceTiers, discountCodes } from '@nvyt/db'
import { eq, and, sql } from 'drizzle-orm'

/**
 * Cancel a pending order and release all reserved inventory.
 *
 * - Decrements ticketTypes.quantitySold
 * - Decrements ticketPriceTiers.quantitySold (by priceTierName + ticketTypeId)
 * - Sets tickets to 'cancelled'
 * - Sets order paymentStatus to 'failed'
 * - Decrements discountCodes.usageCount if applicable
 */
export async function cancelPendingOrder(pendingOrder: {
  id: string
  orderNumber: string
  discountCodeId: string | null
}): Promise<void> {
  const db = useDatabase()

  // Get tickets to release quantity sold counts
  const pendingTickets = await db
    .select({
      ticketTypeId: tickets.ticketTypeId,
      priceTierName: tickets.priceTierName,
    })
    .from(tickets)
    .where(eq(tickets.orderId, pendingOrder.id))

  // Decrement ticketTypes.quantitySold for each ticket type
  const ticketTypeCountMap = new Map<string, number>()
  for (const t of pendingTickets) {
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

  // Decrement ticketPriceTiers.quantitySold for each tier (grouped by ticketTypeId + priceTierName)
  const tierCountMap = new Map<string, { ticketTypeId: string; priceTierName: string; count: number }>()
  for (const t of pendingTickets) {
    if (!t.priceTierName) continue
    const key = `${t.ticketTypeId}:${t.priceTierName}`
    const existing = tierCountMap.get(key)
    if (existing) {
      existing.count++
    } else {
      tierCountMap.set(key, { ticketTypeId: t.ticketTypeId, priceTierName: t.priceTierName, count: 1 })
    }
  }
  for (const { ticketTypeId, priceTierName, count } of tierCountMap.values()) {
    await db
      .update(ticketPriceTiers)
      .set({
        quantitySold: sql`GREATEST(${ticketPriceTiers.quantitySold} - ${count}, 0)`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ticketPriceTiers.ticketTypeId, ticketTypeId),
          eq(ticketPriceTiers.name, priceTierName)
        )
      )
  }

  // Cancel tickets
  await db
    .update(tickets)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(tickets.orderId, pendingOrder.id))

  // Mark order as failed
  await db
    .update(orders)
    .set({ paymentStatus: 'failed', updatedAt: new Date() })
    .where(eq(orders.id, pendingOrder.id))

  // Decrement discount code usage if applicable
  if (pendingOrder.discountCodeId) {
    await db
      .update(discountCodes)
      .set({
        usageCount: sql`GREATEST(${discountCodes.usageCount} - 1, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(discountCodes.id, pendingOrder.discountCodeId))
  }
}

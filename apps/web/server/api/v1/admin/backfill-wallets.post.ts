import { eq, sql, and, isNull } from 'drizzle-orm'
import { orders, events, transactions, wallets } from '@nvyt/db'
import { processPaymentReceived, getOrCreateWallet } from '~/server/utils/wallet'

/**
 * Backfill wallet transactions for existing paid orders
 * This should be run once after deploying the finance module
 *
 * POST /api/v1/admin/backfill-wallets
 */
export default defineEventHandler(async (event) => {
  // Require authentication
  const session = await requireAuth(event)
  const db = useDatabase()

  // Get all paid orders
  const paidOrders = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      eventId: orders.eventId,
      subtotalAmount: orders.subtotalAmount,
      totalFees: orders.totalFees,
      totalAmount: orders.totalAmount,
      paidAt: orders.paidAt,
      eventTitle: events.title,
      organizerId: events.organizerId,
    })
    .from(orders)
    .innerJoin(events, eq(orders.eventId, events.id))
    .where(
      and(
        eq(orders.paymentStatus, 'paid'),
        sql`${orders.paymentMethod} is distinct from 'external'`
      )
    )
    .orderBy(orders.createdAt)

  console.log(`[Backfill] Found ${paidOrders.length} paid orders`)

  let processed = 0
  let skipped = 0
  let errors = 0
  const results: Array<{ orderNumber: string; status: string; message?: string }> = []

  for (const order of paidOrders) {
    // Check if transaction already exists for this order
    const [existingTx] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.orderId, order.id))
      .limit(1)

    if (existingTx) {
      skipped++
      results.push({ orderNumber: order.orderNumber, status: 'skipped', message: 'Transaction already exists' })
      continue
    }

    if (!order.organizerId) {
      errors++
      results.push({ orderNumber: order.orderNumber, status: 'error', message: 'No organizer found for event' })
      continue
    }

    try {
      const grossAmount = Number(order.totalAmount)

      // Process payment and record transaction
      const walletResult = await processPaymentReceived({
        userId: order.organizerId,
        orderId: order.id,
        eventId: order.eventId,
        grossAmount,
        totalFees: Number(order.totalFees),
        netAmount: Number(order.subtotalAmount) - Number(order.discountAmount),
        eventTitle: order.eventTitle,
      })

      processed++
      results.push({
        orderNumber: order.orderNumber,
        status: 'processed',
        message: `Gross=${grossAmount}, Fees=${walletResult.totalFees}, Net=${walletResult.netAmount}`,
      })

      console.log(
        `[Backfill] Processed order ${order.orderNumber}: ` +
          `Gross=${grossAmount}, Fees=${walletResult.totalFees}, Net=${walletResult.netAmount}`
      )
    } catch (err) {
      errors++
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      results.push({ orderNumber: order.orderNumber, status: 'error', message: errorMessage })
      console.error(`[Backfill] Error processing order ${order.orderNumber}:`, err)
    }
  }

  console.log(`[Backfill] Complete: ${processed} processed, ${skipped} skipped, ${errors} errors`)

  return successResponse({
    summary: {
      totalOrders: paidOrders.length,
      processed,
      skipped,
      errors,
    },
    results,
  })
})

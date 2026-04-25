import { eq, and, sql, inArray } from 'drizzle-orm'
import { orders, events, transactions, wallets } from '@nvyt/db'
import { processPaymentReceived, getOrCreateWallet } from '~/server/utils/wallet'

/**
 * Reconcile wallet transactions and balances.
 *
 * 1. Remove duplicate payment_received transactions (keep oldest per order).
 * 2. Fix remaining payment_received transactions: update fee and netAmount
 *    using the actual order values (totalFees, subtotalAmount).
 * 3. Create missing transactions for paid orders that have none.
 * 4. Recompute each wallet's availableBalance and totalEarnings
 *    from the corrected transaction history.
 *
 * Safe to run multiple times (idempotent).
 *
 * POST /api/v1/admin/reconcile-wallets
 */
export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const db = useDatabase()

  let duplicatesRemoved = 0
  let txUpdated = 0
  let txSkipped = 0
  let txCreated = 0
  let walletsRecalculated = 0

  // Step 1: Remove duplicate payment_received transactions (keep the oldest per order)
  const duplicateIds = await db.execute<{ id: string }>(sql`
    SELECT id FROM (
      SELECT id, row_number() OVER (PARTITION BY order_id ORDER BY created_at ASC) as rn
      FROM transactions
      WHERE type = 'payment_received' AND order_id IS NOT NULL
    ) sub
    WHERE rn > 1
  `)

  const idsToDelete = (Array.isArray(duplicateIds) ? duplicateIds : (duplicateIds as any).rows ?? []).map((r: any) => r.id)

  if (idsToDelete.length > 0) {
    await db
      .delete(transactions)
      .where(inArray(transactions.id, idsToDelete))
    duplicatesRemoved = idsToDelete.length

    console.log(`[Reconcile] Removed ${duplicatesRemoved} duplicate transactions`)
  }

  // Step 2: Fix remaining payment_received transactions using actual order values
  const paymentTxs = await db
    .select({
      txId: transactions.id,
      txFee: transactions.fee,
      txNetAmount: transactions.netAmount,
      orderId: transactions.orderId,
      orderNumber: orders.orderNumber,
      orderSubtotal: orders.subtotalAmount,
      orderTotalFees: orders.totalFees,
      orderTotalAmount: orders.totalAmount,
    })
    .from(transactions)
    .innerJoin(orders, eq(transactions.orderId, orders.id))
    .where(eq(transactions.type, 'payment_received'))

  for (const tx of paymentTxs) {
    const correctFee = tx.orderTotalFees
    const correctNet = tx.orderSubtotal

    if (tx.txFee === correctFee && tx.txNetAmount === correctNet) {
      txSkipped++
      continue
    }

    await db
      .update(transactions)
      .set({
        fee: correctFee,
        netAmount: correctNet,
        amount: tx.orderTotalAmount,
      })
      .where(eq(transactions.id, tx.txId))

    txUpdated++
  }

  // Step 3: Create missing transactions for paid orders that have none
  const missingOrders = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      eventId: orders.eventId,
      subtotalAmount: orders.subtotalAmount,
      totalFees: orders.totalFees,
      totalAmount: orders.totalAmount,
      organizerId: events.organizerId,
      eventTitle: events.title,
    })
    .from(orders)
    .innerJoin(events, eq(orders.eventId, events.id))
    .where(
      and(
        eq(orders.paymentStatus, 'paid'),
        sql`${orders.paymentMethod} is distinct from 'external'`,
        sql`NOT EXISTS (
          SELECT 1 FROM transactions t
          WHERE t.order_id = ${orders.id} AND t.type = 'payment_received'
        )`
      )
    )

  for (const order of missingOrders) {
    if (!order.organizerId) continue

    try {
      const wallet = await getOrCreateWallet(order.organizerId)
      const grossAmount = Number(order.totalAmount)
      const totalFees = Number(order.totalFees)
      const netAmount = Number(order.subtotalAmount)

      // Record transaction only (don't update wallet balance — step 4 handles that)
      await db.insert(transactions).values({
        walletId: wallet.id,
        type: 'payment_received',
        amount: String(grossAmount),
        fee: String(totalFees),
        netAmount: String(netAmount),
        currency: 'PHP',
        status: 'completed',
        description: order.eventTitle ? `Ticket sale: ${order.eventTitle}` : 'Payment received',
        orderId: order.id,
        eventId: order.eventId,
      })

      txCreated++
      console.log(`[Reconcile] Created missing transaction for order ${order.orderNumber}`)
    } catch (err) {
      console.error(`[Reconcile] Failed to create transaction for order ${order.orderNumber}:`, err)
    }
  }

  // Step 4: Recompute wallet balances from transaction history
  const allWallets = await db.select().from(wallets)

  for (const wallet of allWallets) {
    const [earnings] = await db
      .select({
        total: sql<string>`coalesce(sum(${transactions.netAmount}::numeric), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.walletId, wallet.id),
          eq(transactions.type, 'payment_received'),
          eq(transactions.status, 'completed')
        )
      )

    const [refunds] = await db
      .select({
        total: sql<string>`coalesce(sum(abs(${transactions.netAmount}::numeric)), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.walletId, wallet.id),
          eq(transactions.type, 'refund'),
          eq(transactions.status, 'completed')
        )
      )

    const [payouts] = await db
      .select({
        total: sql<string>`coalesce(sum(abs(${transactions.netAmount}::numeric)), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.walletId, wallet.id),
          eq(transactions.type, 'payout'),
          eq(transactions.status, 'completed')
        )
      )

    const totalEarnings = parseFloat(earnings.total) - parseFloat(refunds.total)
    const availableBalance = totalEarnings - parseFloat(payouts.total)

    const oldAvailable = wallet.availableBalance
    const oldEarnings = wallet.totalEarnings

    await db
      .update(wallets)
      .set({
        totalEarnings: String(totalEarnings),
        availableBalance: String(availableBalance),
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, wallet.id))

    walletsRecalculated++

    console.log(
      `[Reconcile] Wallet ${wallet.id}: ` +
        `earnings ${oldEarnings} -> ${totalEarnings}, ` +
        `available ${oldAvailable} -> ${availableBalance}`
    )
  }

  console.log(
    `[Reconcile] Complete: ${duplicatesRemoved} duplicates removed, ${txCreated} created, ${txUpdated} fixed, ${txSkipped} correct, ${walletsRecalculated} wallets recalculated`
  )

  return successResponse({
    summary: {
      duplicatesRemoved,
      transactionsCreated: txCreated,
      transactionsFixed: txUpdated,
      transactionsAlreadyCorrect: txSkipped,
      walletsRecalculated,
    },
  })
})

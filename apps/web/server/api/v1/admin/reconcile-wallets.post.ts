import { eq, and, sql } from 'drizzle-orm'
import { orders, transactions, wallets } from '@nvyt/db'

/**
 * Reconcile wallet transactions and balances.
 *
 * 1. Fix payment_received transactions: update fee and netAmount
 *    using the actual order values (totalFees, subtotalAmount)
 *    instead of the old hardcoded 3% calculation.
 *
 * 2. Recompute each wallet's availableBalance and totalEarnings
 *    from the corrected transaction history.
 *
 * POST /api/v1/admin/reconcile-wallets
 */
export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const db = useDatabase()

  let txUpdated = 0
  let txSkipped = 0
  let walletsRecalculated = 0
  const details: Array<{ orderId: string; orderNumber: string; oldFee: string; newFee: string; oldNet: string; newNet: string }> = []

  // Step 1: Fix payment_received transactions using actual order values
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

    // Skip if already correct
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
    details.push({
      orderId: tx.orderId!,
      orderNumber: tx.orderNumber,
      oldFee: tx.txFee!,
      newFee: correctFee,
      oldNet: tx.txNetAmount,
      newNet: correctNet,
    })
  }

  // Step 2: Recompute wallet balances from transaction history
  // For each wallet, recalculate based on all transactions
  const allWallets = await db.select().from(wallets)

  for (const wallet of allWallets) {
    // Sum net earnings from payment_received transactions
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

    // Sum refunds (these reduce earnings)
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

    // Sum completed payouts (already deducted from available)
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
    `[Reconcile] Complete: ${txUpdated} transactions fixed, ${txSkipped} already correct, ${walletsRecalculated} wallets recalculated`
  )

  return successResponse({
    summary: {
      transactionsFixed: txUpdated,
      transactionsAlreadyCorrect: txSkipped,
      walletsRecalculated,
    },
    details,
  })
})

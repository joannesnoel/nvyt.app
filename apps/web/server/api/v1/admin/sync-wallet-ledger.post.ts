import { eq, and, sql, inArray } from 'drizzle-orm'
import { wallets, transactions, orders, events } from '@nvyt/db'

/**
 * Sync wallet ledger to the orders table (the source of truth).
 *
 * 1. Delete `payment_received` transactions whose order has paymentMethod='external'.
 *    External payments are collected by the organizer off-platform and must not
 *    flow through the platform wallet.
 * 2. Insert missing `payment_received` transactions for paid, non-external orders
 *    that have no ledger entry.
 * 3. Recompute `wallets.totalEarnings` and `wallets.availableBalance` for every
 *    affected wallet from the cleaned ledger:
 *      totalEarnings    = sum(payment_received.netAmount) - sum(refund.netAmount)
 *      availableBalance = totalEarnings - sum(payout.netAmount, completed)
 *
 * Idempotent — safe to run multiple times.
 *
 * Usage:
 *   POST /api/v1/admin/sync-wallet-ledger?dryRun=1   → preview, no writes
 *   POST /api/v1/admin/sync-wallet-ledger            → apply changes
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  requireAdmin(user.email)

  const query = getQuery(event)
  const dryRun = query.dryRun === '1' || query.dryRun === 'true'

  const db = useDatabase()

  // 1) Stale: payment_received rows for external orders
  const staleRows = await db
    .select({
      id: transactions.id,
      walletId: transactions.walletId,
      netAmount: transactions.netAmount,
      orderId: transactions.orderId,
    })
    .from(transactions)
    .innerJoin(orders, eq(orders.id, transactions.orderId))
    .where(
      and(
        eq(transactions.type, 'payment_received'),
        eq(orders.paymentMethod, 'external')
      )
    )
  const staleSum = staleRows.reduce((acc, r) => acc + Number(r.netAmount), 0)

  // 2) Missing: paid non-external orders without a payment_received row
  const missingRows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      eventId: orders.eventId,
      subtotalAmount: orders.subtotalAmount,
      discountAmount: orders.discountAmount,
      totalFees: orders.totalFees,
      totalAmount: orders.totalAmount,
      organizerId: events.organizerId,
      eventTitle: events.title,
    })
    .from(orders)
    .innerJoin(events, eq(events.id, orders.eventId))
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
  const missingSum = missingRows.reduce(
    (acc, r) => acc + (Number(r.subtotalAmount) - Number(r.discountAmount)),
    0
  )

  if (dryRun || (staleRows.length === 0 && missingRows.length === 0)) {
    return successResponse({
      dryRun,
      staleCount: staleRows.length,
      staleNetSum: staleSum,
      missingCount: missingRows.length,
      missingNetSum: missingSum,
      walletsRecomputed: 0,
      message:
        staleRows.length === 0 && missingRows.length === 0
          ? 'Ledger already in sync — nothing to do.'
          : 'Dry run — no changes applied.',
    })
  }

  let deleted = 0
  let inserted = 0
  let walletsRecomputed = 0

  // 1) Delete stale external rows
  if (staleRows.length > 0) {
    const ids = staleRows.map((r) => r.id)
    await db.delete(transactions).where(inArray(transactions.id, ids))
    deleted = ids.length
  }

  // 2) Insert missing payment_received rows; ensure each organizer has a wallet
  const ensuredWallets = new Map<string, string>()
  for (const o of missingRows) {
    if (!o.organizerId) continue

    let walletId = ensuredWallets.get(o.organizerId)
    if (!walletId) {
      const [existing] = await db
        .select({ id: wallets.id })
        .from(wallets)
        .where(eq(wallets.userId, o.organizerId))
        .limit(1)

      if (existing) {
        walletId = existing.id
      } else {
        const [created] = await db
          .insert(wallets)
          .values({
            userId: o.organizerId,
            availableBalance: '0',
            pendingBalance: '0',
            totalEarnings: '0',
            currency: 'PHP',
          })
          .returning({ id: wallets.id })
        walletId = created!.id
      }
      ensuredWallets.set(o.organizerId, walletId)
    }

    const grossAmount = Number(o.totalAmount)
    const totalFees = Number(o.totalFees)
    const netAmount = Number(o.subtotalAmount) - Number(o.discountAmount)

    await db.insert(transactions).values({
      walletId,
      type: 'payment_received',
      amount: grossAmount.toFixed(2),
      fee: totalFees.toFixed(2),
      netAmount: netAmount.toFixed(2),
      currency: 'PHP',
      status: 'completed',
      description: `Ticket sale: ${o.eventTitle}`,
      orderId: o.id,
      eventId: o.eventId,
    })
    inserted++
  }

  // 3) Recompute affected wallets
  const affected = new Set<string>([
    ...staleRows.map((r) => r.walletId),
    ...Array.from(ensuredWallets.values()),
  ])

  for (const walletId of affected) {
    const [earnings] = await db
      .select({
        total: sql<string>`coalesce(sum(${transactions.netAmount}::numeric), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.walletId, walletId),
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
          eq(transactions.walletId, walletId),
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
          eq(transactions.walletId, walletId),
          eq(transactions.type, 'payout'),
          eq(transactions.status, 'completed')
        )
      )

    const totalEarnings = Number(earnings?.total ?? 0) - Number(refunds?.total ?? 0)
    const availableBalance = totalEarnings - Number(payouts?.total ?? 0)

    await db
      .update(wallets)
      .set({
        totalEarnings: totalEarnings.toFixed(2),
        availableBalance: availableBalance.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, walletId))

    walletsRecomputed++
  }

  return successResponse({
    dryRun: false,
    staleCount: staleRows.length,
    staleNetSum: staleSum,
    deleted,
    missingCount: missingRows.length,
    missingNetSum: missingSum,
    inserted,
    walletsRecomputed,
    message: 'Wallet ledger synced.',
  })
})

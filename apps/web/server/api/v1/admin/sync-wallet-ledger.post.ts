import { eq, and, sql, inArray } from 'drizzle-orm'
import { wallets, transactions, orders, events } from '@nvyt/db'

/**
 * Sync wallet ledger to the orders table (the source of truth).
 *
 * 1. Delete `payment_received` transactions whose order has paymentMethod='external'.
 *    External payments are collected by the organizer off-platform and must not
 *    flow through the platform wallet.
 * 2. Deduplicate `payment_received` rows per order (keep the oldest, delete the rest).
 * 3. Fix `amount`, `fee`, and `netAmount` on every remaining `payment_received` row
 *    to match the source order: amount=totalAmount, fee=totalFees,
 *    netAmount=(subtotalAmount - discountAmount).
 * 4. Insert missing `payment_received` rows for paid, non-external orders that
 *    have no ledger entry.
 * 5. Recompute `wallets.totalEarnings` and `wallets.availableBalance` for every
 *    wallet touched by steps 1–4:
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

  // 2) Duplicates: per-order extra payment_received rows (keep oldest)
  const duplicates = await db.execute<{
    id: string
    wallet_id: string
    net_amount: string
  }>(sql`
    SELECT id, wallet_id, net_amount FROM (
      SELECT id, wallet_id, net_amount,
             row_number() OVER (PARTITION BY order_id ORDER BY created_at ASC) AS rn
      FROM transactions
      WHERE type = 'payment_received' AND order_id IS NOT NULL
    ) sub
    WHERE rn > 1
  `)
  const duplicateRows = (Array.isArray(duplicates)
    ? duplicates
    : (duplicates as any).rows ?? []) as Array<{
    id: string
    wallet_id: string
    net_amount: string
  }>

  // 3) Mismatched: payment_received rows whose stored values disagree with the order
  //    (excluding external orders, which step 1 will delete; excluding duplicates,
  //     which step 2 will delete)
  const mismatched = await db
    .select({
      txId: transactions.id,
      walletId: transactions.walletId,
      txAmount: transactions.amount,
      txFee: transactions.fee,
      txNetAmount: transactions.netAmount,
      orderId: orders.id,
      orderTotalAmount: orders.totalAmount,
      orderTotalFees: orders.totalFees,
      orderSubtotal: orders.subtotalAmount,
      orderDiscount: orders.discountAmount,
    })
    .from(transactions)
    .innerJoin(orders, eq(orders.id, transactions.orderId))
    .where(
      and(
        eq(transactions.type, 'payment_received'),
        sql`${orders.paymentMethod} is distinct from 'external'`
      )
    )
  const mismatchedToFix = mismatched.filter((m) => {
    const truthNet = Number(m.orderSubtotal) - Number(m.orderDiscount)
    return (
      Number(m.txAmount) !== Number(m.orderTotalAmount) ||
      Number(m.txFee) !== Number(m.orderTotalFees) ||
      Number(m.txNetAmount) !== truthNet
    )
  })

  // 4) Missing: paid non-external orders without a payment_received row
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

  const nothingToDo =
    staleRows.length === 0 &&
    duplicateRows.length === 0 &&
    mismatchedToFix.length === 0 &&
    missingRows.length === 0

  if (dryRun || nothingToDo) {
    return successResponse({
      dryRun,
      staleCount: staleRows.length,
      staleNetSum: staleSum,
      duplicateCount: duplicateRows.length,
      mismatchedCount: mismatchedToFix.length,
      missingCount: missingRows.length,
      missingNetSum: missingSum,
      walletsRecomputed: 0,
      message: nothingToDo
        ? 'Ledger already in sync — nothing to do.'
        : 'Dry run — no changes applied.',
    })
  }

  let deleted = 0
  let dedupedDeleted = 0
  let updated = 0
  let inserted = 0
  let walletsRecomputed = 0

  // Step 1) Delete stale external rows
  if (staleRows.length > 0) {
    const ids = staleRows.map((r) => r.id)
    await db.delete(transactions).where(inArray(transactions.id, ids))
    deleted = ids.length
  }

  // Step 2) Delete duplicate payment_received rows
  if (duplicateRows.length > 0) {
    const ids = duplicateRows.map((r) => r.id)
    await db.delete(transactions).where(inArray(transactions.id, ids))
    dedupedDeleted = ids.length
  }

  // Step 3) Fix mismatched rows. Only update those whose order is NOT external
  //         (already deleted) and whose tx wasn't a duplicate (already deleted).
  const deletedIdSet = new Set([
    ...staleRows.map((r) => r.id),
    ...duplicateRows.map((r) => r.id),
  ])
  for (const m of mismatchedToFix) {
    if (deletedIdSet.has(m.txId)) continue
    const truthNet = (Number(m.orderSubtotal) - Number(m.orderDiscount)).toFixed(2)
    const truthFee = Number(m.orderTotalFees).toFixed(2)
    const truthAmount = Number(m.orderTotalAmount).toFixed(2)
    await db
      .update(transactions)
      .set({
        amount: truthAmount,
        fee: truthFee,
        netAmount: truthNet,
      })
      .where(eq(transactions.id, m.txId))
    updated++
  }

  // Step 4) Insert missing payment_received rows; ensure each organizer has a wallet
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

  // Step 5) Recompute every wallet touched by any of the above steps
  const affected = new Set<string>([
    ...staleRows.map((r) => r.walletId),
    ...duplicateRows.map((r) => r.wallet_id),
    ...mismatchedToFix.map((r) => r.walletId),
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
    duplicateCount: duplicateRows.length,
    dedupedDeleted,
    mismatchedCount: mismatchedToFix.length,
    updated,
    missingCount: missingRows.length,
    missingNetSum: missingSum,
    inserted,
    walletsRecomputed,
    message: 'Wallet ledger synced.',
  })
})

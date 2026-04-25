import { sql } from 'drizzle-orm'
import { wallets, transactions } from '@nvyt/db'

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
  const stale = await db.execute<{
    id: string
    wallet_id: string
    net_amount: string
    order_id: string
  }>(sql`
    SELECT t.id, t.wallet_id, t.net_amount, t.order_id
    FROM transactions t
    JOIN orders o ON o.id = t.order_id
    WHERE t.type = 'payment_received'
      AND o.payment_method = 'external'
  `)
  const staleRows = stale as unknown as Array<{
    id: string
    wallet_id: string
    net_amount: string
    order_id: string
  }>
  const staleSum = staleRows.reduce((acc, r) => acc + Number(r.net_amount), 0)

  // 2) Missing: paid non-external orders without a payment_received row
  const missing = await db.execute<{
    id: string
    order_number: string
    event_id: string
    subtotal_amount: string
    discount_amount: string
    total_fees: string
    total_amount: string
    organizer_id: string
    event_title: string
  }>(sql`
    SELECT o.id, o.order_number, o.event_id,
           o.subtotal_amount, o.discount_amount, o.total_fees, o.total_amount,
           e.organizer_id, e.title AS event_title
    FROM orders o
    JOIN events e ON e.id = o.event_id
    WHERE o.payment_status = 'paid'
      AND o.payment_method IS DISTINCT FROM 'external'
      AND NOT EXISTS (
        SELECT 1 FROM transactions t
        WHERE t.order_id = o.id AND t.type = 'payment_received'
      )
  `)
  const missingRows = missing as unknown as Array<{
    id: string
    order_number: string
    event_id: string
    subtotal_amount: string
    discount_amount: string
    total_fees: string
    total_amount: string
    organizer_id: string
    event_title: string
  }>
  const missingSum = missingRows.reduce(
    (acc, r) => acc + (Number(r.subtotal_amount) - Number(r.discount_amount)),
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

  // Apply within a transaction (atomic + idempotent)
  await db.transaction(async (tx) => {
    // 1) Delete stale external rows
    if (staleRows.length > 0) {
      const ids = staleRows.map((r) => r.id)
      const result = await tx.execute(sql`
        DELETE FROM transactions WHERE id = ANY(${ids}::uuid[]) RETURNING id
      `)
      deleted = (result as unknown as Array<{ id: string }>).length
    }

    // 2) Insert missing payment_received rows. Ensure each organizer has a wallet.
    const ensuredWallets = new Map<string, string>()
    for (const o of missingRows) {
      let walletId = ensuredWallets.get(o.organizer_id)
      if (!walletId) {
        const existing = await tx.execute<{ id: string }>(sql`
          SELECT id FROM wallets WHERE user_id = ${o.organizer_id} LIMIT 1
        `)
        const existingRows = existing as unknown as Array<{ id: string }>
        if (existingRows[0]) {
          walletId = existingRows[0].id
        } else {
          const created = await tx.execute<{ id: string }>(sql`
            INSERT INTO wallets (user_id, available_balance, pending_balance, total_earnings, currency)
            VALUES (${o.organizer_id}, 0, 0, 0, 'PHP')
            RETURNING id
          `)
          walletId = (created as unknown as Array<{ id: string }>)[0]!.id
        }
        ensuredWallets.set(o.organizer_id, walletId!)
      }

      const grossAmount = Number(o.total_amount)
      const totalFees = Number(o.total_fees)
      const netAmount = Number(o.subtotal_amount) - Number(o.discount_amount)

      await tx.insert(transactions).values({
        walletId: walletId!,
        type: 'payment_received',
        amount: grossAmount.toFixed(2),
        fee: totalFees.toFixed(2),
        netAmount: netAmount.toFixed(2),
        currency: 'PHP',
        status: 'completed',
        description: `Ticket sale: ${o.event_title}`,
        orderId: o.id,
        eventId: o.event_id,
      })
      inserted++
    }

    // 3) Recompute affected wallets
    const affected = new Set<string>([
      ...staleRows.map((r) => r.wallet_id),
      ...Array.from(ensuredWallets.values()),
    ])

    for (const walletId of affected) {
      const earnings = (await tx.execute<{ total: string }>(sql`
        SELECT COALESCE(SUM(net_amount::numeric), 0)::text AS total
        FROM transactions
        WHERE wallet_id = ${walletId} AND type = 'payment_received' AND status = 'completed'
      `)) as unknown as Array<{ total: string }>

      const refunds = (await tx.execute<{ total: string }>(sql`
        SELECT COALESCE(SUM(ABS(net_amount::numeric)), 0)::text AS total
        FROM transactions
        WHERE wallet_id = ${walletId} AND type = 'refund' AND status = 'completed'
      `)) as unknown as Array<{ total: string }>

      const payouts = (await tx.execute<{ total: string }>(sql`
        SELECT COALESCE(SUM(ABS(net_amount::numeric)), 0)::text AS total
        FROM transactions
        WHERE wallet_id = ${walletId} AND type = 'payout' AND status = 'completed'
      `)) as unknown as Array<{ total: string }>

      const totalEarnings = Number(earnings[0]?.total ?? 0) - Number(refunds[0]?.total ?? 0)
      const availableBalance = totalEarnings - Number(payouts[0]?.total ?? 0)

      await tx.execute(sql`
        UPDATE wallets
        SET total_earnings = ${totalEarnings.toFixed(2)},
            available_balance = ${availableBalance.toFixed(2)},
            updated_at = NOW()
        WHERE id = ${walletId}
      `)
      walletsRecomputed++
    }
  })

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

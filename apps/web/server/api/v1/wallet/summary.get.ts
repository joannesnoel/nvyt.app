import { eq, sql, desc, and, inArray } from 'drizzle-orm'
import { wallets, transactions, events } from '@nvyt/db'
import { getOrCreateWallet } from '~/server/utils/wallet'

export default defineEventHandler(async (event) => {
  // Require authentication
  const user = await requireAuth(event)
  const userId = user.id
  const db = useDatabase()

  // Get wallet
  const wallet = await getOrCreateWallet(userId)

  // Get earnings breakdown by event
  // Now we only have payment_received and refund transactions
  // Platform fees are stored in the 'fee' field of payment_received transactions
  const earningsByEvent = await db
    .select({
      eventId: transactions.eventId,
      eventTitle: events.title,
      eventDate: events.startDate,
      // Gross = sum of amounts for payment_received transactions
      grossAmount: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'payment_received' THEN ${transactions.amount} ELSE 0 END), 0)`,
      // Platform fees = sum of fee field for payment_received transactions
      platformFees: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'payment_received' THEN ${transactions.fee} ELSE 0 END), 0)`,
      // Refunds = sum of amounts for refund transactions (absolute value)
      refunds: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'refund' THEN ABS(${transactions.amount}) ELSE 0 END), 0)`,
      // Net = sum of netAmount for all transactions
      netEarnings: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} IN ('payment_received', 'refund') THEN ${transactions.netAmount} ELSE 0 END), 0)`,
      transactionCount: sql<number>`COUNT(CASE WHEN ${transactions.type} IN ('payment_received', 'refund') THEN 1 END)`,
    })
    .from(transactions)
    .innerJoin(events, eq(transactions.eventId, events.id))
    .where(
      and(
        eq(transactions.walletId, wallet.id),
        inArray(transactions.type, ['payment_received', 'refund'])
      )
    )
    .groupBy(transactions.eventId, events.title, events.startDate)
    .orderBy(desc(events.startDate))

  // Get recent transactions (exclude platform_fee type as we no longer create them)
  const recentTransactions = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      fee: transactions.fee,
      netAmount: transactions.netAmount,
      description: transactions.description,
      status: transactions.status,
      eventId: transactions.eventId,
      eventTitle: events.title,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .leftJoin(events, eq(transactions.eventId, events.id))
    .where(
      and(
        eq(transactions.walletId, wallet.id),
        inArray(transactions.type, ['payment_received', 'refund', 'payout'])
      )
    )
    .orderBy(desc(transactions.createdAt))
    .limit(10)

  // Calculate totals
  const totals = {
    grossEarnings: 0,
    platformFees: 0,
    refunds: 0,
    netEarnings: 0,
  }

  for (const row of earningsByEvent) {
    totals.grossEarnings += parseFloat(row.grossAmount || '0')
    totals.platformFees += parseFloat(row.platformFees || '0')
    totals.refunds += parseFloat(row.refunds || '0')
    totals.netEarnings += parseFloat(row.netEarnings || '0')
  }

  return successResponse({
    wallet: {
      id: wallet.id,
      availableBalance: wallet.availableBalance,
      pendingBalance: wallet.pendingBalance,
      totalEarnings: wallet.totalEarnings,
      currency: wallet.currency,
    },
    totals,
    earningsByEvent: earningsByEvent.map((e) => ({
      eventId: e.eventId,
      eventTitle: e.eventTitle,
      eventDate: e.eventDate,
      grossAmount: e.grossAmount,
      platformFees: e.platformFees,
      refunds: e.refunds,
      netEarnings: e.netEarnings,
      transactionCount: e.transactionCount,
    })),
    recentTransactions,
  })
})

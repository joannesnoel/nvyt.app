import { eq, sql, desc, and, inArray } from 'drizzle-orm'
import { wallets, transactions, events, orders } from '@nvyt/db'
import { getOrCreateWallet } from '~/server/utils/wallet'

export default defineEventHandler(async (event) => {
  // Require authentication
  const user = await requireAuth(event)
  const userId = user.id
  const db = useDatabase()

  // Get wallet
  const wallet = await getOrCreateWallet(userId)

  if (!wallet) {
    throw createError({
      statusCode: 500,
      message: 'Failed to get or create wallet',
    })
  }

  // Get earnings breakdown by event — calculated from orders (source of truth)
  const earningsByEvent = await db
    .select({
      eventId: orders.eventId,
      eventTitle: events.title,
      eventDate: events.startDate,
      grossAmount: sql<string>`COALESCE(SUM(${orders.totalAmount}::numeric), 0)`,
      platformFees: sql<string>`COALESCE(SUM(${orders.adminFee}::numeric), 0)`,
      processingFees: sql<string>`COALESCE(SUM(${orders.processingFee}::numeric), 0)`,
      totalDiscounts: sql<string>`COALESCE(SUM(${orders.discountAmount}::numeric), 0)`,
      netEarnings: sql<string>`COALESCE(SUM(${orders.subtotalAmount}::numeric - ${orders.discountAmount}::numeric), 0)`,
      orderCount: sql<number>`COUNT(*)::int`,
    })
    .from(orders)
    .innerJoin(events, eq(orders.eventId, events.id))
    .where(
      and(
        eq(events.organizerId, userId),
        eq(orders.paymentStatus, 'paid'),
        sql`${orders.paymentMethod} is distinct from 'external'`
      )
    )
    .groupBy(orders.eventId, events.title, events.startDate)
    .orderBy(desc(events.startDate))

  // Get recent transactions for activity log (still from transactions table)
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
    .leftJoin(orders, eq(transactions.orderId, orders.id))
    .where(
      and(
        eq(transactions.walletId, wallet.id),
        inArray(transactions.type, ['payment_received', 'refund', 'payout']),
        sql`(${orders.paymentMethod} is distinct from 'external' OR ${transactions.type} = 'payout')`
      )
    )
    .orderBy(desc(transactions.createdAt))
    .limit(10)

  // Calculate totals from order-based earnings
  const totals = {
    grossEarnings: 0,
    platformFees: 0,
    refunds: 0,
    netEarnings: 0,
  }

  for (const row of earningsByEvent) {
    totals.grossEarnings += parseFloat(row.grossAmount || '0')
    totals.platformFees += parseFloat(row.platformFees || '0')
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
      refunds: '0',
      netEarnings: e.netEarnings,
      transactionCount: e.orderCount,
    })),
    recentTransactions,
  })
})

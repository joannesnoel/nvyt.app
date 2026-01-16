import { eq, sql, and, gte, lte, desc, inArray } from 'drizzle-orm'
import { wallets, transactions, events } from '@nvyt/db'
import { z } from 'zod'
import { getOrCreateWallet } from '~/server/utils/wallet'

const querySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  eventId: z.string().uuid().optional(),
  groupBy: z.enum(['day', 'week', 'month', 'event']).default('day'),
})

export default defineEventHandler(async (event) => {
  // Require authentication
  const user = await requireAuth(event)
  const userId = user.id
  const db = useDatabase()

  // Parse query parameters
  const query = getQuery(event)
  const result = querySchema.safeParse(query)

  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Invalid query parameters',
      data: result.error.flatten(),
    })
  }

  const { startDate, endDate, eventId, groupBy } = result.data

  // Get wallet
  const wallet = await getOrCreateWallet(userId)

  if (!wallet) {
    throw createError({
      statusCode: 500,
      message: 'Failed to get or create wallet',
    })
  }

  // Build conditions - only include payment_received and refund transactions
  const conditions = [
    eq(transactions.walletId, wallet.id),
    inArray(transactions.type, ['payment_received', 'refund', 'payout']),
  ]

  if (startDate) {
    conditions.push(gte(transactions.createdAt, new Date(startDate)))
  }

  if (endDate) {
    conditions.push(lte(transactions.createdAt, new Date(endDate)))
  }

  if (eventId) {
    conditions.push(eq(transactions.eventId, eventId))
  }

  // Get summary totals
  // Platform fees are now stored in the 'fee' field of payment_received transactions
  const summaryResult = await db
    .select({
      grossRevenue: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'payment_received' THEN ${transactions.amount} ELSE 0 END), 0)`,
      platformFees: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'payment_received' THEN ${transactions.fee} ELSE 0 END), 0)`,
      refunds: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'refund' THEN ABS(${transactions.amount}) ELSE 0 END), 0)`,
      payouts: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'payout' THEN ABS(${transactions.netAmount}) ELSE 0 END), 0)`,
      netEarnings: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} IN ('payment_received', 'refund') THEN ${transactions.netAmount} ELSE 0 END), 0)`,
      transactionCount: sql<number>`COUNT(CASE WHEN ${transactions.type} IN ('payment_received', 'refund') THEN 1 END)`,
    })
    .from(transactions)
    .where(and(...conditions))

  const summary = {
    grossRevenue: parseFloat(summaryResult[0]?.grossRevenue || '0'),
    platformFees: parseFloat(summaryResult[0]?.platformFees || '0'),
    refunds: parseFloat(summaryResult[0]?.refunds || '0'),
    payouts: parseFloat(summaryResult[0]?.payouts || '0'),
    netEarnings: parseFloat(summaryResult[0]?.netEarnings || '0'),
    transactionCount: summaryResult[0]?.transactionCount || 0,
  }

  // Get breakdown by grouping
  let breakdown: Array<{
    period?: string
    eventId?: string
    eventTitle?: string
    grossRevenue: number
    platformFees: number
    refunds: number
    netEarnings: number
    transactionCount: number
  }> = []

  if (groupBy === 'event') {
    // Group by event
    const eventBreakdown = await db
      .select({
        eventId: transactions.eventId,
        eventTitle: events.title,
        grossRevenue: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'payment_received' THEN ${transactions.amount} ELSE 0 END), 0)`,
        platformFees: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'payment_received' THEN ${transactions.fee} ELSE 0 END), 0)`,
        refunds: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'refund' THEN ABS(${transactions.amount}) ELSE 0 END), 0)`,
        netEarnings: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} IN ('payment_received', 'refund') THEN ${transactions.netAmount} ELSE 0 END), 0)`,
        transactionCount: sql<number>`COUNT(CASE WHEN ${transactions.type} IN ('payment_received', 'refund') THEN 1 END)`,
      })
      .from(transactions)
      .leftJoin(events, eq(transactions.eventId, events.id))
      .where(and(...conditions))
      .groupBy(transactions.eventId, events.title)
      .orderBy(desc(sql`SUM(CASE WHEN ${transactions.type} = 'payment_received' THEN ${transactions.amount} ELSE 0 END)`))

    breakdown = eventBreakdown.map((row) => ({
      eventId: row.eventId || undefined,
      eventTitle: row.eventTitle || 'Unknown Event',
      grossRevenue: parseFloat(row.grossRevenue),
      platformFees: parseFloat(row.platformFees),
      refunds: parseFloat(row.refunds),
      netEarnings: parseFloat(row.netEarnings),
      transactionCount: row.transactionCount,
    }))
  } else {
    // Group by time period
    let dateFormat: string
    switch (groupBy) {
      case 'month':
        dateFormat = 'YYYY-MM'
        break
      case 'week':
        dateFormat = 'IYYY-IW'
        break
      default:
        dateFormat = 'YYYY-MM-DD'
    }

    const timeBreakdown = await db
      .select({
        period: sql<string>`TO_CHAR(${transactions.createdAt}, ${dateFormat})`,
        grossRevenue: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'payment_received' THEN ${transactions.amount} ELSE 0 END), 0)`,
        platformFees: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'payment_received' THEN ${transactions.fee} ELSE 0 END), 0)`,
        refunds: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'refund' THEN ABS(${transactions.amount}) ELSE 0 END), 0)`,
        netEarnings: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} IN ('payment_received', 'refund') THEN ${transactions.netAmount} ELSE 0 END), 0)`,
        transactionCount: sql<number>`COUNT(CASE WHEN ${transactions.type} IN ('payment_received', 'refund') THEN 1 END)`,
      })
      .from(transactions)
      .where(and(...conditions))
      .groupBy(sql`TO_CHAR(${transactions.createdAt}, ${dateFormat})`)
      .orderBy(sql`TO_CHAR(${transactions.createdAt}, ${dateFormat})`)

    breakdown = timeBreakdown.map((row) => ({
      period: row.period,
      grossRevenue: parseFloat(row.grossRevenue),
      platformFees: parseFloat(row.platformFees),
      refunds: parseFloat(row.refunds),
      netEarnings: parseFloat(row.netEarnings),
      transactionCount: row.transactionCount,
    }))
  }

  return successResponse({
    summary,
    breakdown,
    filters: {
      startDate,
      endDate,
      eventId,
      groupBy,
    },
  })
})

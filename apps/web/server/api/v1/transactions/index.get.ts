import { eq, sql, desc, and, gte, lte, inArray } from 'drizzle-orm'
import { wallets, transactions, events, orders } from '@nvyt/db'
import { z } from 'zod'
import { getOrCreateWallet } from '~/server/utils/wallet'

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(['payment_received', 'refund', 'payout', 'platform_fee']).optional(),
  eventId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
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

  const { page, limit, type, eventId, startDate, endDate } = result.data
  const offset = (page - 1) * limit

  // Get wallet
  const wallet = await getOrCreateWallet(userId)

  if (!wallet) {
    throw createError({
      statusCode: 500,
      message: 'Failed to get or create wallet',
    })
  }

  // Build conditions
  const conditions = [eq(transactions.walletId, wallet.id)]

  if (type) {
    conditions.push(eq(transactions.type, type))
  }

  if (eventId) {
    conditions.push(eq(transactions.eventId, eventId))
  }

  if (startDate) {
    conditions.push(gte(transactions.createdAt, new Date(startDate)))
  }

  if (endDate) {
    conditions.push(lte(transactions.createdAt, new Date(endDate)))
  }

  // Get transactions with event info
  const transactionsList = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      fee: transactions.fee,
      netAmount: transactions.netAmount,
      currency: transactions.currency,
      status: transactions.status,
      description: transactions.description,
      orderId: transactions.orderId,
      eventId: transactions.eventId,
      eventTitle: events.title,
      payoutId: transactions.payoutId,
      metadata: transactions.metadata,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .leftJoin(events, eq(transactions.eventId, events.id))
    .where(and(...conditions))
    .orderBy(desc(transactions.createdAt))
    .limit(limit)
    .offset(offset)

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactions)
    .where(and(...conditions))

  const total = Number(countResult[0]?.count ?? 0)

  return successResponse(
    { transactions: transactionsList },
    {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    }
  )
})

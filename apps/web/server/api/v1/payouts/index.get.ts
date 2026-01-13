import { eq, sql, desc, and } from 'drizzle-orm'
import { payouts, wallets } from '@nvyt/db'
import { z } from 'zod'
import { getOrCreateWallet } from '~/server/utils/wallet'

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'processing', 'completed', 'rejected']).optional(),
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

  const { page, limit, status } = result.data
  const offset = (page - 1) * limit

  // Build conditions
  const conditions = [eq(payouts.userId, userId)]

  if (status) {
    conditions.push(eq(payouts.status, status))
  }

  // Get payouts
  const payoutsList = await db
    .select({
      id: payouts.id,
      amount: payouts.amount,
      fee: payouts.fee,
      netAmount: payouts.netAmount,
      currency: payouts.currency,
      status: payouts.status,
      bankName: payouts.bankName,
      accountName: payouts.accountName,
      accountNumber: payouts.accountNumber,
      processedAt: payouts.processedAt,
      rejectionReason: payouts.rejectionReason,
      notes: payouts.notes,
      requestedAt: payouts.requestedAt,
      createdAt: payouts.createdAt,
    })
    .from(payouts)
    .where(and(...conditions))
    .orderBy(desc(payouts.requestedAt))
    .limit(limit)
    .offset(offset)

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(payouts)
    .where(and(...conditions))

  const total = Number(countResult[0]?.count ?? 0)

  return successResponse(
    { payouts: payoutsList },
    {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    }
  )
})

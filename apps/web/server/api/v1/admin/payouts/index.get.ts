import { eq, sql, desc, and } from 'drizzle-orm'
import { payouts, users, wallets } from '@nvyt/db'
import { z } from 'zod'

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'processing', 'completed', 'rejected']).optional(),
})

// Admin emails (in production, use env variable or database role)
const ADMIN_EMAILS = ['jon@creativelogik.net']

export default defineEventHandler(async (event) => {
  // Require authentication
  const user = await requireAuth(event)

  // Check if user is admin
  if (!ADMIN_EMAILS.includes(user.email)) {
    throw createError({
      statusCode: 403,
      message: 'Admin access required',
    })
  }

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
  const conditions = []
  if (status) {
    conditions.push(eq(payouts.status, status))
  }

  // Get payouts with user info
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
      // User info
      userId: payouts.userId,
      userName: users.name,
      userEmail: users.email,
    })
    .from(payouts)
    .innerJoin(users, eq(payouts.userId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(payouts.requestedAt))
    .limit(limit)
    .offset(offset)

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(payouts)
    .where(conditions.length > 0 ? and(...conditions) : undefined)

  const total = Number(countResult[0]?.count ?? 0)

  // Get summary stats
  const [stats] = await db
    .select({
      pendingCount: sql<number>`count(*) filter (where ${payouts.status} = 'pending')`,
      pendingAmount: sql<string>`coalesce(sum(case when ${payouts.status} = 'pending' then ${payouts.amount} else 0 end), 0)`,
      processingCount: sql<number>`count(*) filter (where ${payouts.status} = 'processing')`,
      processingAmount: sql<string>`coalesce(sum(case when ${payouts.status} = 'processing' then ${payouts.amount} else 0 end), 0)`,
      completedCount: sql<number>`count(*) filter (where ${payouts.status} = 'completed')`,
      completedAmount: sql<string>`coalesce(sum(case when ${payouts.status} = 'completed' then ${payouts.amount} else 0 end), 0)`,
    })
    .from(payouts)

  return successResponse(
    {
      payouts: payoutsList,
      stats: {
        pending: { count: Number(stats?.pendingCount || 0), amount: parseFloat(stats?.pendingAmount || '0') },
        processing: { count: Number(stats?.processingCount || 0), amount: parseFloat(stats?.processingAmount || '0') },
        completed: { count: Number(stats?.completedCount || 0), amount: parseFloat(stats?.completedAmount || '0') },
      },
    },
    {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    }
  )
})

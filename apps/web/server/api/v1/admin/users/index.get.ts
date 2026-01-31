import { eq, sql, desc, and, or, ilike } from 'drizzle-orm'
import { users, events, orders } from '@nvyt/db'
import { z } from 'zod'

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  emailVerified: z.enum(['true', 'false']).optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  requireAdmin(user.email)

  const db = useDatabase()

  const query = getQuery(event)
  const result = querySchema.safeParse(query)

  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Invalid query parameters',
      data: result.error.flatten(),
    })
  }

  const { page, limit, search, emailVerified } = result.data
  const offset = (page - 1) * limit

  // Build conditions
  const conditions = []
  if (search) {
    conditions.push(
      or(
        ilike(users.name, `%${search}%`),
        ilike(users.email, `%${search}%`),
      )
    )
  }
  if (emailVerified !== undefined) {
    conditions.push(eq(users.emailVerified, emailVerified === 'true'))
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  // Get users with counts
  const usersList = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      avatarUrl: users.avatarUrl,
      hasGoogle: sql<boolean>`${users.googleId} is not null`,
      hasFacebook: sql<boolean>`${users.facebookId} is not null`,
      eventCount: sql<number>`(select count(*) from ${events} where ${events.organizerId} = ${users.id})`,
      orderCount: sql<number>`(select count(*) from ${orders} where ${orders.userId} = ${users.id})`,
    })
    .from(users)
    .where(whereClause)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset)

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(whereClause)

  const total = Number(countResult[0]?.count ?? 0)

  // Get stats
  const [stats] = await db
    .select({
      totalUsers: sql<number>`count(*)`,
      verifiedCount: sql<number>`count(*) filter (where ${users.emailVerified} = true)`,
      unverifiedCount: sql<number>`count(*) filter (where ${users.emailVerified} = false or ${users.emailVerified} is null)`,
    })
    .from(users)

  return successResponse(
    {
      users: usersList,
      stats: {
        total: Number(stats?.totalUsers || 0),
        verified: Number(stats?.verifiedCount || 0),
        unverified: Number(stats?.unverifiedCount || 0),
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

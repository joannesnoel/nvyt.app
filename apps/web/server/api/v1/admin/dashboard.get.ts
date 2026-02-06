import { sql, desc, eq } from 'drizzle-orm'
import { users, eventVerifications, payouts, events, orders } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  requireAdmin(user.email)

  const db = useDatabase()

  // Get user stats
  const [userStats] = await db
    .select({
      total: sql<number>`count(*)`,
      verified: sql<number>`count(*) filter (where ${users.emailVerified} = true)`,
      unverified: sql<number>`count(*) filter (where ${users.emailVerified} = false or ${users.emailVerified} is null)`,
      thisWeek: sql<number>`count(*) filter (where ${users.createdAt} >= now() - interval '7 days')`,
      lastWeek: sql<number>`count(*) filter (where ${users.createdAt} >= now() - interval '14 days' and ${users.createdAt} < now() - interval '7 days')`,
    })
    .from(users)

  // Get verification stats
  const [verificationStats] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${eventVerifications.status} = 'pending')`,
      underReview: sql<number>`count(*) filter (where ${eventVerifications.status} = 'under_review')`,
      approved: sql<number>`count(*) filter (where ${eventVerifications.status} = 'approved')`,
      rejected: sql<number>`count(*) filter (where ${eventVerifications.status} = 'rejected')`,
    })
    .from(eventVerifications)

  // Get payout stats
  const [payoutStats] = await db
    .select({
      pendingCount: sql<number>`count(*) filter (where ${payouts.status} = 'pending')`,
      pendingAmount: sql<string>`coalesce(sum(case when ${payouts.status} = 'pending' then ${payouts.amount} else 0 end), 0)`,
      completedCount: sql<number>`count(*) filter (where ${payouts.status} = 'completed')`,
      completedAmount: sql<string>`coalesce(sum(case when ${payouts.status} = 'completed' then ${payouts.amount} else 0 end), 0)`,
    })
    .from(payouts)

  // Get order/revenue stats
  const [orderStats] = await db
    .select({
      totalOrders: sql<number>`count(*)`,
      paidOrders: sql<number>`count(*) filter (where ${orders.paymentStatus} = 'paid')`,
      totalRevenue: sql<string>`coalesce(sum(case when ${orders.paymentStatus} = 'paid' then ${orders.totalAmount} else 0 end), 0)`,
    })
    .from(orders)

  // Get recent activity
  const recentUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(5)

  const recentVerifications = await db
    .select({
      id: eventVerifications.id,
      status: eventVerifications.status,
      businessName: eventVerifications.businessName,
      submittedAt: eventVerifications.submittedAt,
      eventTitle: events.title,
    })
    .from(eventVerifications)
    .innerJoin(events, eq(eventVerifications.eventId, events.id))
    .orderBy(desc(eventVerifications.submittedAt))
    .limit(5)

  const recentPayouts = await db
    .select({
      id: payouts.id,
      amount: payouts.amount,
      status: payouts.status,
      requestedAt: payouts.requestedAt,
      userName: users.name,
    })
    .from(payouts)
    .innerJoin(users, eq(payouts.userId, users.id))
    .orderBy(desc(payouts.requestedAt))
    .limit(5)

  // Build activity timeline
  const activity = [
    ...recentUsers.map((u) => ({
      id: `user-${u.id}`,
      type: 'user' as const,
      title: `New user: ${u.name}`,
      description: u.email,
      timestamp: u.createdAt,
      link: '/admin/users',
    })),
    ...recentVerifications.map((v) => ({
      id: `verification-${v.id}`,
      type: 'verification' as const,
      title: v.status === 'pending' ? `Verification submitted: ${v.businessName}` : `Verification ${v.status}: ${v.businessName}`,
      description: v.eventTitle,
      timestamp: v.submittedAt,
      link: '/admin/verifications',
    })),
    ...recentPayouts.map((p) => ({
      id: `payout-${p.id}`,
      type: 'payout' as const,
      title: p.status === 'pending' ? `Payout requested: PHP ${parseFloat(String(p.amount)).toLocaleString()}` : `Payout ${p.status}: PHP ${parseFloat(String(p.amount)).toLocaleString()}`,
      description: p.userName,
      timestamp: p.requestedAt,
      link: '/admin/payouts',
    })),
  ]
    .sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime())
    .slice(0, 10)

  // Calculate trends
  const userTrend = userStats?.lastWeek
    ? Math.round(((Number(userStats.thisWeek) - Number(userStats.lastWeek)) / Number(userStats.lastWeek)) * 100)
    : 0

  return successResponse({
    stats: {
      users: {
        total: Number(userStats?.total || 0),
        verified: Number(userStats?.verified || 0),
        unverified: Number(userStats?.unverified || 0),
        trend: userTrend,
      },
      verifications: {
        pending: Number(verificationStats?.pending || 0),
        underReview: Number(verificationStats?.underReview || 0),
        approved: Number(verificationStats?.approved || 0),
        rejected: Number(verificationStats?.rejected || 0),
      },
      payouts: {
        pendingCount: Number(payoutStats?.pendingCount || 0),
        pendingAmount: parseFloat(payoutStats?.pendingAmount || '0'),
        completedCount: Number(payoutStats?.completedCount || 0),
        completedAmount: parseFloat(payoutStats?.completedAmount || '0'),
      },
      orders: {
        total: Number(orderStats?.totalOrders || 0),
        paid: Number(orderStats?.paidOrders || 0),
        revenue: parseFloat(orderStats?.totalRevenue || '0'),
      },
    },
    activity,
  })
})

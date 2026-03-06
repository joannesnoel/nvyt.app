import { sql, eq, gte } from 'drizzle-orm'
import { orders } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  requireAdmin(user.email)

  const db = useDatabase()

  const query = getQuery(event)
  const allowedDays = [7, 14, 30, 90]
  const requestedDays = Number(query.days) || 7
  const days = allowedDays.includes(requestedDays) ? requestedDays : 7

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - (days - 1))
  startDate.setHours(0, 0, 0, 0)

  // Generate all dates in range
  const dateLabels: string[] = []
  const currentDate = new Date(startDate)
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  while (currentDate <= today) {
    dateLabels.push(currentDate.toISOString().split('T')[0])
    currentDate.setDate(currentDate.getDate() + 1)
  }

  // Daily revenue (net = subtotal - discount)
  const dailyRevenue = await db
    .select({
      date: sql<string>`DATE(${orders.paidAt})`.as('date'),
      amount: sql<number>`COALESCE(SUM(${orders.subtotalAmount}::numeric - ${orders.discountAmount}::numeric), 0)`.as('amount'),
    })
    .from(orders)
    .where(
      sql`${orders.paymentStatus} = 'paid' AND ${orders.paidAt} >= ${startDate}`,
    )
    .groupBy(sql`DATE(${orders.paidAt})`)
    .orderBy(sql`DATE(${orders.paidAt})`)

  const revenueMap = new Map(dailyRevenue.map(r => [r.date, Number(r.amount)]))

  const daily = dateLabels.map(date => ({
    date,
    amount: revenueMap.get(date) || 0,
  }))

  const periodTotal = daily.reduce((sum, d) => sum + d.amount, 0)

  return successResponse({
    dateLabels,
    revenue: {
      daily,
      periodTotal,
    },
  })
})

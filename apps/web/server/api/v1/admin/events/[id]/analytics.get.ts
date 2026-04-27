import { sql, eq, gte, and } from 'drizzle-orm'
import { orders } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  requireAdmin(user.email)

  const eventId = getRouterParam(event, 'id')
  if (!eventId) {
    throw createError({ statusCode: 400, message: 'Event ID required' })
  }

  const db = useDatabase()

  const query = getQuery(event)
  const allowedDays = [7, 14, 30, 90]
  const requestedDays = Number(query.days) || 7
  const days = allowedDays.includes(requestedDays) ? requestedDays : 7

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - (days - 1))
  startDate.setHours(0, 0, 0, 0)

  const dateLabels: string[] = []
  const currentDate = new Date(startDate)
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  while (currentDate <= today) {
    const y = currentDate.getFullYear()
    const m = String(currentDate.getMonth() + 1).padStart(2, '0')
    const d = String(currentDate.getDate()).padStart(2, '0')
    dateLabels.push(`${y}-${m}-${d}`)
    currentDate.setDate(currentDate.getDate() + 1)
  }

  const dailyRevenue = await db
    .select({
      date: sql<string>`DATE(${orders.paidAt})::text`.as('date'),
      amount: sql<number>`COALESCE(SUM(${orders.subtotalAmount}::numeric - ${orders.discountAmount}::numeric), 0)`.as('amount'),
    })
    .from(orders)
    .where(
      and(
        eq(orders.eventId, eventId),
        eq(orders.paymentStatus, 'paid'),
        gte(orders.paidAt, startDate),
        sql`${orders.paymentMethod} is distinct from 'external'`,
      ),
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

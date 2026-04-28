import { eq, desc, and, ilike, or, sql, inArray } from 'drizzle-orm'
import { orders, tickets, users } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  requireAdmin(user.email)

  const eventId = getRouterParam(event, 'id')
  if (!eventId) {
    throw createError({ statusCode: 400, message: 'Event ID is required' })
  }

  const db = useDatabase()

  const query = getQuery(event)
  const page = parseInt(query.page as string) || 1
  const limit = Math.min(parseInt(query.limit as string) || 20, 100)
  const offset = (page - 1) * limit
  const status = query.status as string | undefined
  const search = (query.search as string | undefined)?.trim() || undefined

  const conditions = [eq(orders.eventId, eventId)]
  if (status) {
    conditions.push(eq(orders.paymentStatus, status as any))
  } else {
    conditions.push(inArray(orders.paymentStatus, ['paid', 'pending', 'refunded']))
  }
  if (search) {
    const s = `%${search.toLowerCase()}%`
    conditions.push(
      or(
        ilike(orders.orderNumber, s),
        ilike(users.name, s),
        ilike(users.email, s),
      )!,
    )
  }

  const results = await db
    .select({
      order: orders,
      customer: { id: users.id, name: users.name, email: users.email },
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(orders.createdAt))
    .limit(limit)
    .offset(offset)

  // Ticket counts per order
  const orderIds = results.map(r => r.order.id)
  let ticketCounts: Record<string, number> = {}
  if (orderIds.length > 0) {
    const counts = await db
      .select({
        orderId: tickets.orderId,
        count: sql<number>`count(*)::int`,
      })
      .from(tickets)
      .where(inArray(tickets.orderId, orderIds))
      .groupBy(tickets.orderId)
    ticketCounts = counts.reduce<Record<string, number>>((acc, c) => {
      acc[c.orderId] = c.count
      return acc
    }, {})
  }

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(and(...conditions))
  const total = countRow?.count ?? 0

  return successResponse(
    {
      orders: results.map(({ order, customer }) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customer,
        subtotalAmount: parseFloat(order.subtotalAmount),
        adminFee: parseFloat(order.adminFee),
        processingFee: parseFloat(order.processingFee),
        totalFees: parseFloat(order.totalFees),
        totalAmount: parseFloat(order.totalAmount),
        discountAmount: parseFloat(order.discountAmount),
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        paymentProvider: order.paymentProvider,
        refundedAmount: order.refundedAmount != null ? parseFloat(order.refundedAmount) : null,
        refundedAt: order.refundedAt,
        createdAt: order.createdAt,
        ticketCount: ticketCounts[order.id] ?? 0,
      })),
    },
    {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  )
})

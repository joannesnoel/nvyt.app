import { orders, events, tickets, ticketTypes } from '@nvyt/db'
import { eq, desc, and, count } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const query = getQuery(event)

  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20))
  const offset = (page - 1) * limit
  const status = query.status as string | undefined

  const db = useDatabase()

  // Build where conditions
  const conditions = [eq(orders.userId, user.id)]
  if (status && ['pending', 'paid', 'failed', 'refunded'].includes(status)) {
    conditions.push(eq(orders.paymentStatus, status as 'pending' | 'paid' | 'failed' | 'refunded'))
  }

  // Get total count
  const [countResult] = await db
    .select({ total: count() })
    .from(orders)
    .where(and(...conditions))

  const total = countResult?.total || 0

  // Get orders with event info
  const userOrders = await db
    .select({
      order: orders,
      event: {
        id: events.id,
        title: events.title,
        slug: events.slug,
        coverImage: events.coverImage,
        startDate: events.startDate,
        location: events.location,
        status: events.status,
      },
    })
    .from(orders)
    .innerJoin(events, eq(orders.eventId, events.id))
    .where(and(...conditions))
    .orderBy(desc(orders.createdAt))
    .limit(limit)
    .offset(offset)

  // Get ticket counts for each order
  const ordersWithTicketCount = await Promise.all(
    userOrders.map(async ({ order, event }) => {
      const [ticketCount] = await db
        .select({ count: count() })
        .from(tickets)
        .where(eq(tickets.orderId, order.id))

      return {
        ...order,
        event,
        ticketCount: ticketCount?.count || 0,
      }
    })
  )

  return paginatedResponse(ordersWithTicketCount, page, limit, total)
})

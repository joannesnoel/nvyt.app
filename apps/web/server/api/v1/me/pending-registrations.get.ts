import { orders, tickets, events, ticketRegistrationFields } from '@nvyt/db'
import { eq, and, sql, inArray } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const db = useDatabase()
  const user = await requireAuth(event)

  // Get all paid orders for this user
  const userOrders = await db
    .select({
      order: orders,
      event: {
        id: events.id,
        title: events.title,
        slug: events.slug,
        coverImage: events.coverImage,
        startDate: events.startDate,
      },
    })
    .from(orders)
    .innerJoin(events, eq(orders.eventId, events.id))
    .where(
      and(
        eq(orders.userId, user.id),
        eq(orders.paymentStatus, 'paid')
      )
    )

  if (userOrders.length === 0) {
    return successResponse({ pendingRegistrations: [] })
  }

  // Get event IDs that have active registration fields
  const eventIds = [...new Set(userOrders.map(o => o.event.id))]

  const eventsWithRegistration = await db
    .select({
      eventId: ticketRegistrationFields.eventId,
      count: sql<number>`count(*)::int`,
    })
    .from(ticketRegistrationFields)
    .where(
      and(
        inArray(ticketRegistrationFields.eventId, eventIds),
        eq(ticketRegistrationFields.isActive, true)
      )
    )
    .groupBy(ticketRegistrationFields.eventId)

  const eventIdsWithRegistration = new Set(eventsWithRegistration.map(e => e.eventId))

  // Filter orders to only those with registration fields
  const ordersWithRegistration = userOrders.filter(o => eventIdsWithRegistration.has(o.event.id))

  if (ordersWithRegistration.length === 0) {
    return successResponse({ pendingRegistrations: [] })
  }

  // Get ticket stats for these orders
  const orderIds = ordersWithRegistration.map(o => o.order.id)

  const ticketStats = await db
    .select({
      orderId: tickets.orderId,
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${tickets.registrationCompleted} = true)::int`,
    })
    .from(tickets)
    .where(inArray(tickets.orderId, orderIds))
    .groupBy(tickets.orderId)

  const ticketStatsByOrder = ticketStats.reduce(
    (acc, s) => {
      acc[s.orderId] = { total: s.total, completed: s.completed, pending: s.total - s.completed }
      return acc
    },
    {} as Record<string, { total: number; completed: number; pending: number }>
  )

  // Build response with only orders that have pending registrations
  const pendingRegistrations = ordersWithRegistration
    .map(({ order, event }) => {
      const stats = ticketStatsByOrder[order.id] || { total: 0, completed: 0, pending: 0 }
      if (stats.pending === 0) return null

      return {
        orderNumber: order.orderNumber,
        event: {
          title: event.title,
          slug: event.slug,
          coverImage: event.coverImage,
          startDate: event.startDate,
        },
        registrationStats: stats,
      }
    })
    .filter(Boolean)

  return successResponse({ pendingRegistrations })
})

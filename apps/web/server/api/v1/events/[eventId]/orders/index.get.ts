import { eq, desc, and, ilike, or, sql, inArray } from 'drizzle-orm'
import { orders, tickets, ticketTypes, users, events, ticketRegistrationFields } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const query = getQuery(event)

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  const db = useDatabase()
  const user = await requireAuth(event)

  // Verify event exists and user is organizer
  const [eventData] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)

  if (!eventData) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  if (eventData.organizerId !== user.id) {
    throw createError({
      statusCode: 403,
      message: 'Only the event organizer can view orders',
    })
  }

  // Parse query params
  const page = parseInt(query.page as string) || 1
  const limit = Math.min(parseInt(query.limit as string) || 20, 100)
  const offset = (page - 1) * limit
  const status = query.status as string | undefined
  const search = query.search as string | undefined

  // Build where conditions
  const conditions = [eq(orders.eventId, eventId)]

  if (status) {
    conditions.push(eq(orders.paymentStatus, status as any))
  }

  // Get orders with customer info
  let orderQuery = db
    .select({
      order: orders,
      customer: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(orders.createdAt))

  // Apply search if provided
  if (search) {
    const searchLower = `%${search.toLowerCase()}%`
    orderQuery = db
      .select({
        order: orders,
        customer: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(orders)
      .innerJoin(users, eq(orders.userId, users.id))
      .where(
        and(
          ...conditions,
          or(
            ilike(orders.orderNumber, searchLower),
            ilike(users.name, searchLower),
            ilike(users.email, searchLower)
          )
        )
      )
      .orderBy(desc(orders.createdAt))
  }

  // Execute with pagination
  const results = await orderQuery.limit(limit).offset(offset)

  // Check if event has active registration fields
  const [registrationFieldCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ticketRegistrationFields)
    .where(
      and(
        eq(ticketRegistrationFields.eventId, eventId),
        eq(ticketRegistrationFields.isActive, true)
      )
    )
  const hasRegistrationFields = (registrationFieldCount?.count ?? 0) > 0

  // Get ticket counts and registration completion for each order
  const orderIds = results.map((r) => r.order.id)

  let ticketStats: Record<string, { count: number; registrationCompleted: number }> = {}
  if (orderIds.length > 0) {
    const counts = await db
      .select({
        orderId: tickets.orderId,
        count: sql<number>`count(*)::int`,
        registrationCompleted: sql<number>`count(*) filter (where ${tickets.registrationCompleted} = true)::int`,
      })
      .from(tickets)
      .where(inArray(tickets.orderId, orderIds))
      .groupBy(tickets.orderId)

    ticketStats = counts.reduce(
      (acc, c) => {
        acc[c.orderId] = {
          count: c.count,
          registrationCompleted: c.registrationCompleted,
        }
        return acc
      },
      {} as Record<string, { count: number; registrationCompleted: number }>
    )
  }

  // Count total for pagination
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(...conditions))
  const total = countResult[0]?.count ?? 0

  // Calculate stats
  const [stats] = await db
    .select({
      totalOrders: sql<number>`count(*)::int`,
      paidOrders: sql<number>`count(*) filter (where ${orders.paymentStatus} = 'paid')::int`,
      pendingOrders: sql<number>`count(*) filter (where ${orders.paymentStatus} = 'pending')::int`,
      refundedOrders: sql<number>`count(*) filter (where ${orders.paymentStatus} = 'refunded')::int`,
      totalRevenue: sql<number>`coalesce(sum(case when ${orders.paymentStatus} = 'paid' then ${orders.totalAmount}::numeric else 0 end), 0)`,
    })
    .from(orders)
    .where(eq(orders.eventId, eventId))

  return successResponse(
    {
      orders: results.map(({ order, customer }) => {
        const orderStats = ticketStats[order.id] || { count: 0, registrationCompleted: 0 }
        return {
          ...order,
          customer,
          ticketCount: orderStats.count,
          registrationCompleted: orderStats.registrationCompleted,
        }
      }),
      stats: {
        totalOrders: stats?.totalOrders || 0,
        paidOrders: stats?.paidOrders || 0,
        pendingOrders: stats?.pendingOrders || 0,
        refundedOrders: stats?.refundedOrders || 0,
        totalRevenue: parseFloat(String(stats?.totalRevenue || 0)),
      },
      hasRegistrationFields,
    },
    {
      page,
      limit,
      total: total || 0,
      totalPages: Math.ceil((total || 0) / limit),
    }
  )
})

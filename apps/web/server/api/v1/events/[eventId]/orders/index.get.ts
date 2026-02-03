import { eq, desc, and, ilike, or, sql, inArray } from 'drizzle-orm'
import { orders, tickets, ticketTypes, users, ticketRegistrationFields } from '@nvyt/db'

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

  // Verify event exists and user has analytics access (owner or collaborator with canViewAnalytics)
  await requireEventAccess(event, eventId, 'canViewAnalytics')

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
  } else {
    // By default, exclude failed orders
    conditions.push(inArray(orders.paymentStatus, ['paid', 'pending', 'refunded']))
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

  // Calculate stats (excluding failed orders)
  const [stats] = await db
    .select({
      totalOrders: sql<number>`count(*) filter (where ${orders.paymentStatus} in ('paid', 'pending', 'refunded'))::int`,
      paidOrders: sql<number>`count(*) filter (where ${orders.paymentStatus} = 'paid')::int`,
      pendingOrders: sql<number>`count(*) filter (where ${orders.paymentStatus} = 'pending')::int`,
      refundedOrders: sql<number>`count(*) filter (where ${orders.paymentStatus} = 'refunded')::int`,
      grossSales: sql<number>`coalesce(sum(case when ${orders.paymentStatus} = 'paid' then ${orders.totalAmount}::numeric else 0 end), 0)`,
      processingFees: sql<number>`coalesce(sum(case when ${orders.paymentStatus} = 'paid' then ${orders.processingFee}::numeric else 0 end), 0)`,
      platformFees: sql<number>`coalesce(sum(case when ${orders.paymentStatus} = 'paid' then ${orders.adminFee}::numeric else 0 end), 0)`,
      totalDiscounts: sql<number>`coalesce(sum(case when ${orders.paymentStatus} = 'paid' then ${orders.discountAmount}::numeric else 0 end), 0)`,
      netEarnings: sql<number>`coalesce(sum(case when ${orders.paymentStatus} = 'paid' then (${orders.subtotalAmount}::numeric - ${orders.discountAmount}::numeric) else 0 end), 0)`,
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
        grossSales: parseFloat(String(stats?.grossSales || 0)),
        processingFees: parseFloat(String(stats?.processingFees || 0)),
        platformFees: parseFloat(String(stats?.platformFees || 0)),
        totalDiscounts: parseFloat(String(stats?.totalDiscounts || 0)),
        netEarnings: parseFloat(String(stats?.netEarnings || 0)),
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

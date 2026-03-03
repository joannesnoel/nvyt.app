import { eq, sql, desc, and, inArray } from 'drizzle-orm'
import { events, users, attendees, tickets, ticketTypes, orders, eventVerifications } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  requireAdmin(user.email)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  const db = useDatabase()

  // Get event with organizer info
  const [eventRow] = await db
    .select({
      id: events.id,
      title: events.title,
      slug: events.slug,
      description: events.description,
      thumbnailImage: events.thumbnailImage,
      coverImage: events.coverImage,
      status: events.status,
      registrationMode: events.registrationMode,
      visibility: events.visibility,
      startDate: events.startDate,
      endDate: events.endDate,
      timezone: events.timezone,
      location: events.location,
      maxAttendees: events.maxAttendees,
      contributionsEnabled: events.contributionsEnabled,
      createdAt: events.createdAt,
      organizer: {
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(events)
    .innerJoin(users, eq(events.organizerId, users.id))
    .where(eq(events.id, id))

  if (!eventRow) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  // Attendee stats
  const [attendeeStats] = await db
    .select({
      total: sql<number>`count(*)`,
      confirmed: sql<number>`count(*) filter (where ${attendees.status} = 'confirmed')`,
      pending: sql<number>`count(*) filter (where ${attendees.status} = 'pending')`,
      checkedIn: sql<number>`count(*) filter (where ${attendees.checkedInAt} is not null)`,
    })
    .from(attendees)
    .where(eq(attendees.eventId, id))

  // Order/financial stats
  const [orderStats] = await db
    .select({
      totalOrders: sql<number>`count(*)`,
      paidOrders: sql<number>`count(*) filter (where ${orders.paymentStatus} = 'paid')`,
      grossRevenue: sql<number>`coalesce(sum(case when ${orders.paymentStatus} = 'paid' then ${orders.totalAmount}::numeric else 0 end), 0)`,
      netRevenue: sql<number>`coalesce(sum(case when ${orders.paymentStatus} = 'paid' then (${orders.subtotalAmount}::numeric - ${orders.discountAmount}::numeric) else 0 end), 0)`,
      totalFees: sql<number>`coalesce(sum(case when ${orders.paymentStatus} = 'paid' then ${orders.totalFees}::numeric else 0 end), 0)`,
    })
    .from(orders)
    .where(eq(orders.eventId, id))

  // Ticket check-in stats
  const [ticketStats] = await db
    .select({
      totalTickets: sql<number>`count(*) filter (where ${tickets.status} in ('confirmed', 'checked_in'))`,
      checkedIn: sql<number>`count(*) filter (where ${tickets.status} = 'checked_in')`,
    })
    .from(tickets)
    .where(eq(tickets.eventId, id))

  const totalTickets = Number(ticketStats?.totalTickets || 0)
  const checkedInTickets = Number(ticketStats?.checkedIn || 0)
  const checkInRate = totalTickets > 0 ? Math.round((checkedInTickets / totalTickets) * 100) : 0

  // Recent orders (last 10, excluding failed)
  const recentOrders = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      customerName: orders.customerName,
      customerEmail: orders.customerEmail,
      totalAmount: orders.totalAmount,
      paymentStatus: orders.paymentStatus,
      createdAt: orders.createdAt,
      ticketCount: sql<number>`(select count(*)::int from "tickets" where "tickets"."order_id" = "orders"."id")`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.eventId, id),
        inArray(orders.paymentStatus, ['paid', 'pending', 'refunded']),
      )
    )
    .orderBy(desc(orders.createdAt))
    .limit(10)

  // Ticket types with sold count and revenue
  const ticketTypesList = await db
    .select({
      id: ticketTypes.id,
      name: ticketTypes.name,
      price: ticketTypes.price,
      quantity: ticketTypes.quantity,
      quantitySold: ticketTypes.quantitySold,
      status: ticketTypes.status,
      revenue: sql<number>`(select coalesce(sum("tickets"."price_paid"::numeric), 0) from "tickets" where "tickets"."ticket_type_id" = "ticket_types"."id" and "tickets"."status" in ('confirmed', 'checked_in'))`,
    })
    .from(ticketTypes)
    .where(eq(ticketTypes.eventId, id))
    .orderBy(ticketTypes.sortOrder)

  // Verification status (may be null)
  const [verification] = await db
    .select({
      id: eventVerifications.id,
      status: eventVerifications.status,
      businessName: eventVerifications.businessName,
      businessType: eventVerifications.businessType,
      country: eventVerifications.country,
      adminFeeRate: eventVerifications.adminFeeRate,
      submittedAt: eventVerifications.submittedAt,
      reviewedAt: eventVerifications.reviewedAt,
    })
    .from(eventVerifications)
    .where(eq(eventVerifications.eventId, id))

  // Compute registration count based on mode
  const registrations = eventRow.registrationMode === 'tickets'
    ? Number(ticketStats?.totalTickets || 0)
    : Number(attendeeStats?.confirmed || 0) + Number(attendeeStats?.pending || 0)

  return successResponse({
    event: eventRow,
    stats: {
      registrations,
      attendees: {
        total: Number(attendeeStats?.total || 0),
        confirmed: Number(attendeeStats?.confirmed || 0),
        pending: Number(attendeeStats?.pending || 0),
        checkedIn: Number(attendeeStats?.checkedIn || 0),
      },
      orders: {
        totalOrders: Number(orderStats?.totalOrders || 0),
        paidOrders: Number(orderStats?.paidOrders || 0),
        grossRevenue: parseFloat(String(orderStats?.grossRevenue || 0)),
        netRevenue: parseFloat(String(orderStats?.netRevenue || 0)),
        totalFees: parseFloat(String(orderStats?.totalFees || 0)),
      },
      tickets: {
        totalTickets,
        checkedIn: checkedInTickets,
        checkInRate,
      },
    },
    recentOrders: recentOrders.map((o) => ({
      ...o,
      totalAmount: parseFloat(String(o.totalAmount || 0)),
    })),
    ticketTypes: ticketTypesList.map((tt) => ({
      ...tt,
      price: parseFloat(String(tt.price || 0)),
      revenue: parseFloat(String(tt.revenue || 0)),
    })),
    verification: verification || null,
  })
})

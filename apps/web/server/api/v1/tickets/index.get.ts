import { tickets, ticketTypes, events, orders, users } from '@nvyt/db'
import { eq, desc, and, or, count } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const query = getQuery(event)

  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20))
  const offset = (page - 1) * limit
  const status = query.status as string | undefined
  const eventId = query.eventId as string | undefined
  const upcoming = query.upcoming === 'true'

  const db = useDatabase()

  // Build where conditions - include tickets where user is purchaser OR attendee
  const conditions = [
    or(
      eq(tickets.userId, user.id),
      eq(tickets.attendeeUserId, user.id)
    )
  ]
  if (status && ['pending', 'confirmed', 'cancelled', 'checked_in', 'refunded'].includes(status)) {
    conditions.push(eq(tickets.status, status as 'pending' | 'confirmed' | 'cancelled' | 'checked_in' | 'refunded'))
  }
  if (eventId) {
    conditions.push(eq(tickets.eventId, eventId))
  }

  // Get total count
  const [countResult] = await db
    .select({ total: count() })
    .from(tickets)
    .where(and(...conditions))

  const total = countResult?.total || 0

  // Get tickets with event and ticket type info
  let ticketsQuery = db
    .select({
      ticket: tickets,
      ticketType: {
        id: ticketTypes.id,
        name: ticketTypes.name,
        description: ticketTypes.description,
        price: ticketTypes.price,
      },
      event: {
        id: events.id,
        title: events.title,
        slug: events.slug,
        coverImage: events.coverImage,
        promoVideoUrl: events.promoVideoUrl,
        startDate: events.startDate,
        endDate: events.endDate,
        timezone: events.timezone,
        location: events.location,
        status: events.status,
      },
      order: {
        id: orders.id,
        orderNumber: orders.orderNumber,
        paymentStatus: orders.paymentStatus,
      },
      purchaser: {
        id: users.id,
        name: users.name,
      },
    })
    .from(tickets)
    .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
    .innerJoin(events, eq(tickets.eventId, events.id))
    .innerJoin(orders, eq(tickets.orderId, orders.id))
    .innerJoin(users, eq(tickets.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(events.startDate), desc(tickets.createdAt))
    .limit(limit)
    .offset(offset)

  const userTickets = await ticketsQuery

  // Filter for upcoming events if requested (post-query filter since it's on joined table)
  let filteredTickets = userTickets
  if (upcoming) {
    const now = new Date()
    filteredTickets = userTickets.filter(
      (t) => t.event.startDate && new Date(t.event.startDate) >= now
    )
  }

  // Format response
  const formattedTickets = filteredTickets.map(({ ticket, ticketType, event, order, purchaser }) => ({
    ...ticket,
    ticketType,
    event,
    order,
    isPurchaser: ticket.userId === user.id,
    purchaser,
  }))

  return paginatedResponse(formattedTickets, page, limit, total)
})

import { tickets, ticketTypes, events, orders } from '@nvyt/db'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const ticketId = getRouterParam(event, 'ticketId')

  if (!ticketId) {
    throw createError({
      statusCode: 400,
      message: 'Ticket ID is required',
    })
  }

  const db = useDatabase()

  // Get ticket with all related info
  const [result] = await db
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
        startDate: events.startDate,
        endDate: events.endDate,
        timezone: events.timezone,
        location: events.location,
        locationDetails: events.locationDetails,
        status: events.status,
      },
      order: {
        id: orders.id,
        orderNumber: orders.orderNumber,
        paymentStatus: orders.paymentStatus,
        paidAt: orders.paidAt,
        customerName: orders.customerName,
        customerEmail: orders.customerEmail,
      },
    })
    .from(tickets)
    .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
    .innerJoin(events, eq(tickets.eventId, events.id))
    .innerJoin(orders, eq(tickets.orderId, orders.id))
    .where(eq(tickets.id, ticketId))
    .limit(1)

  if (!result) {
    throw createError({
      statusCode: 404,
      message: 'Ticket not found',
    })
  }

  // Verify ownership
  if (result.ticket.userId !== user.id) {
    throw createError({
      statusCode: 403,
      message: 'You are not authorized to view this ticket',
    })
  }

  return successResponse({
    ...result.ticket,
    ticketType: result.ticketType,
    event: result.event,
    order: result.order,
  })
})

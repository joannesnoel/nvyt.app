import { tickets, ticketTypes, events, orders, users } from '@nvyt/db'
import { eq } from 'drizzle-orm'

// This endpoint is for organizers to scan QR codes at check-in
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const qrCode = getRouterParam(event, 'qrCode')

  if (!qrCode) {
    throw createError({
      statusCode: 400,
      message: 'QR code is required',
    })
  }

  const db = useDatabase()

  // Get ticket by QR code with all related info
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
        startDate: events.startDate,
        organizerId: events.organizerId,
        status: events.status,
      },
      order: {
        id: orders.id,
        orderNumber: orders.orderNumber,
        paymentStatus: orders.paymentStatus,
        customerName: orders.customerName,
        customerEmail: orders.customerEmail,
      },
      purchaser: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
    .from(tickets)
    .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
    .innerJoin(events, eq(tickets.eventId, events.id))
    .innerJoin(orders, eq(tickets.orderId, orders.id))
    .innerJoin(users, eq(tickets.userId, users.id))
    .where(eq(tickets.qrCode, qrCode))
    .limit(1)

  if (!result) {
    throw createError({
      statusCode: 404,
      message: 'Ticket not found',
    })
  }

  // Verify the current user is the event organizer or has canViewTickets/canCheckIn permission
  if (result.event.organizerId !== user.id) {
    const access = await checkEventAccess(event, result.event.id)
    if (!access?.permissions.canCheckIn && !access?.permissions.canViewTickets) {
      throw createError({
        statusCode: 403,
        message: 'You are not authorized to view tickets for this event',
      })
    }
  }

  // Determine if ticket is valid for check-in
  const isValid = result.ticket.status === 'confirmed' && result.order.paymentStatus === 'paid'
  const isAlreadyCheckedIn = result.ticket.status === 'checked_in'

  return successResponse({
    ...result.ticket,
    ticketType: result.ticketType,
    event: result.event,
    order: result.order,
    purchaser: result.purchaser,
    isValid,
    isAlreadyCheckedIn,
    canCheckIn: isValid && !isAlreadyCheckedIn,
  })
})

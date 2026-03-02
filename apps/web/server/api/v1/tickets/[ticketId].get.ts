import { tickets, ticketTypes, events, orders, users } from '@nvyt/db'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const ticketId = getRouterParam(event, 'ticketId')
  const setupToken = getQuery(event).token as string | undefined

  // Try session auth first, then fall back to setup token
  let userId: string | null = null
  const user = await getUserFromEvent(event)

  if (user) {
    userId = user.id
  } else if (setupToken) {
    const tokenStatus = await verifyAccountSetupToken(setupToken)
    if (tokenStatus.valid) {
      userId = tokenStatus.userId
    }
  }

  if (!userId) {
    throw createError({
      statusCode: 401,
      message: 'Authentication required',
    })
  }

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
    .where(eq(tickets.id, ticketId))
    .limit(1)

  if (!result) {
    throw createError({
      statusCode: 404,
      message: 'Ticket not found',
    })
  }

  // Verify ownership - allow purchaser OR attendee to view
  const isPurchaser = result.ticket.userId === userId
  const isAttendee = result.ticket.attendeeUserId === userId

  if (!isPurchaser && !isAttendee) {
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
    isPurchaser,
    purchaser: result.purchaser,
  })
})

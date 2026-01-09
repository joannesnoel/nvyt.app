import { orders, events, tickets, ticketTypes } from '@nvyt/db'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const orderNumber = getRouterParam(event, 'orderNumber')
  const setupToken = getQuery(event).token as string | undefined

  if (!orderNumber) {
    throw createError({
      statusCode: 400,
      message: 'Order number is required',
    })
  }

  const db = useDatabase()

  // Try to get authenticated user or verify setup token
  let userId: string | null = null
  const user = await getUserFromEvent(event)

  if (user) {
    userId = user.id
  } else if (setupToken) {
    // Verify setup token for guest access
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

  // Get order with event info
  const [result] = await db
    .select({
      order: orders,
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
    })
    .from(orders)
    .innerJoin(events, eq(orders.eventId, events.id))
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1)

  if (!result) {
    throw createError({
      statusCode: 404,
      message: 'Order not found',
    })
  }

  // Verify ownership
  if (result.order.userId !== userId) {
    throw createError({
      statusCode: 403,
      message: 'You are not authorized to view this order',
    })
  }

  // Get tickets with ticket type info
  const orderTickets = await db
    .select({
      ticket: tickets,
      ticketType: {
        id: ticketTypes.id,
        name: ticketTypes.name,
        description: ticketTypes.description,
        price: ticketTypes.price,
      },
    })
    .from(tickets)
    .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
    .where(eq(tickets.orderId, result.order.id))

  return successResponse({
    ...result.order,
    event: result.event,
    tickets: orderTickets.map(({ ticket, ticketType }) => ({
      ...ticket,
      ticketType,
    })),
  })
})

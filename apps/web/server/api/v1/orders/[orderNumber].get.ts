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

  // Get order with event info (including organizer for permission check)
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
        organizerId: events.organizerId,
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

  // Verify access: order owner OR event organizer can view
  const isOrderOwner = result.order.userId === userId
  const isEventOrganizer = result.event.organizerId === userId

  if (!isOrderOwner && !isEventOrganizer) {
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

  // Exclude organizerId from response (only needed for permission check)
  const { organizerId: _, ...eventData } = result.event

  return successResponse({
    ...result.order,
    event: eventData,
    tickets: orderTickets.map(({ ticket, ticketType }) => ({
      ...ticket,
      ticketType,
    })),
  })
})

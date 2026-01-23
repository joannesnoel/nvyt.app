import { orders, events, tickets, ticketTypes, ticketRegistrationFields, users } from '@nvyt/db'
import { eq, and, asc, not, or } from 'drizzle-orm'

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

  // Only allow registration for paid orders
  if (result.order.paymentStatus !== 'paid') {
    throw createError({
      statusCode: 400,
      message: 'Payment must be completed before registration',
    })
  }

  // Get active registration fields for the event
  const registrationFields = await db
    .select()
    .from(ticketRegistrationFields)
    .where(
      and(
        eq(ticketRegistrationFields.eventId, result.event.id),
        eq(ticketRegistrationFields.isActive, true)
      )
    )
    .orderBy(asc(ticketRegistrationFields.sortOrder), asc(ticketRegistrationFields.createdAt))

  // Get tickets with ticket type info and registration status
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

  // Get user profile info for pre-filling
  const [userProfile] = await db
    .select({
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  // Check if user already has a confirmed ticket to this event (excluding current order)
  // Check both as purchaser (userId) and as attendee (attendeeUserId)
  const existingTickets = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(
      and(
        or(
          eq(tickets.userId, userId),
          eq(tickets.attendeeUserId, userId)
        ),
        eq(tickets.eventId, result.event.id),
        eq(tickets.status, 'confirmed'),
        not(eq(tickets.orderId, result.order.id))
      )
    )
    .limit(1)

  const userHasExistingTicket = existingTickets.length > 0

  // Calculate overall registration status
  const totalTickets = orderTickets.length
  const completedTickets = orderTickets.filter((t) => t.ticket.registrationCompleted).length
  const allCompleted = totalTickets > 0 && completedTickets === totalTickets

  // Find next ticket to register
  const nextTicketIndex = orderTickets.findIndex((t) => !t.ticket.registrationCompleted)

  // Exclude organizerId from response
  const { organizerId: _, ...eventData } = result.event

  return successResponse({
    order: {
      orderNumber: result.order.orderNumber,
      paymentStatus: result.order.paymentStatus,
      customerName: result.order.customerName,
      customerEmail: result.order.customerEmail,
    },
    event: eventData,
    registrationFields,
    tickets: orderTickets.map(({ ticket, ticketType }, index) => ({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      attendeeName: ticket.attendeeName,
      attendeeEmail: ticket.attendeeEmail,
      registrationData: ticket.registrationData,
      registrationCompleted: ticket.registrationCompleted,
      registrationCompletedAt: ticket.registrationCompletedAt,
      ticketType,
      index,
    })),
    registrationStatus: {
      totalTickets,
      completedTickets,
      allCompleted,
      nextTicketIndex: nextTicketIndex === -1 ? null : nextTicketIndex,
      // Always require registration since we need attendee name and email for each ticket
      requiresRegistration: true,
    },
    userProfile: userProfile || null,
    userHasExistingTicket,
  })
})

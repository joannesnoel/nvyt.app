import { orders, events, tickets, ticketTypes, ticketRegistrationFields, users } from '@nvyt/db'
import { eq, and, sql, asc, inArray } from 'drizzle-orm'

// Default payment methods if not configured
const DEFAULT_PAYMENT_METHODS = ['gcash', 'paymaya', 'card', 'grab_pay', 'qrph']

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

  // Get tickets with ticket type info (ordered by sortOrder for consistency)
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
    .orderBy(asc(tickets.sortOrder))

  // Check if event has active registration fields
  const [registrationFieldCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ticketRegistrationFields)
    .where(
      and(
        eq(ticketRegistrationFields.eventId, result.event.id),
        eq(ticketRegistrationFields.isActive, true)
      )
    )
  const hasRegistrationFields = (registrationFieldCount?.count ?? 0) > 0

  // Fetch attendee user emails for tickets with attendeeUserId
  const attendeeUserIds = orderTickets
    .map(t => t.ticket.attendeeUserId)
    .filter((id): id is string => id !== null)

  const attendeeEmailsMap = new Map<string, string>()
  if (attendeeUserIds.length > 0) {
    const attendeeUsers = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.id, attendeeUserIds))

    for (const u of attendeeUsers) {
      attendeeEmailsMap.set(u.id, u.email)
    }
  }

  // Calculate registration completion stats
  const ticketList = orderTickets.map(({ ticket, ticketType }) => {
    // Get attendee email from user record if attendeeUserId is set
    const attendeeEmail = ticket.attendeeUserId
      ? attendeeEmailsMap.get(ticket.attendeeUserId) || null
      : null

    return {
      ...ticket,
      attendeeEmail, // Add email from user record
      ticketType,
    }
  })
  const registrationCompleted = ticketList.filter(t => t.registrationCompleted).length
  const registrationPending = ticketList.length - registrationCompleted

  // Exclude organizerId from response (only needed for permission check)
  const { organizerId: _, ...eventData } = result.event

  // Get allowed payment methods from config
  const config = useRuntimeConfig()
  const paymentMethodsStr = config.paymongoPaymentMethods as string | undefined
  const parsedMethods = paymentMethodsStr
    ? paymentMethodsStr.split(',').map((m: string) => m.trim()).filter((m: string) => m.length > 0)
    : []
  const paymentMethodAllowed = parsedMethods.length > 0 ? parsedMethods : DEFAULT_PAYMENT_METHODS

  return successResponse({
    ...result.order,
    event: eventData,
    tickets: ticketList,
    // Payment methods allowed
    paymentMethodAllowed,
    // Registration info
    hasRegistrationFields,
    registrationStats: hasRegistrationFields ? {
      total: ticketList.length,
      completed: registrationCompleted,
      pending: registrationPending,
    } : null,
  })
})

import { eq, and, inArray } from 'drizzle-orm'
import { tickets, ticketTypes, events, orders, users } from '@nvyt/db'
import { generateAllTicketsPdf } from '~/server/utils/ticketPdf'

export default defineEventHandler(async (event) => {
  const orderNumber = getRouterParam(event, 'orderNumber')

  if (!orderNumber) {
    throw createError({
      statusCode: 400,
      message: 'Order number is required',
    })
  }

  const db = useDatabase()
  const user = await requireAuth(event)

  // Fetch order
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1)

  if (!order) {
    throw createError({
      statusCode: 404,
      message: 'Order not found',
    })
  }

  // Fetch event
  const [eventData] = await db
    .select()
    .from(events)
    .where(eq(events.id, order.eventId))
    .limit(1)

  if (!eventData) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  // Check authorization - user must own the order, be the event organizer, or have canViewTickets
  const isOwner = order.userId === user.id
  const isOrganizer = eventData.organizerId === user.id

  if (!isOwner && !isOrganizer) {
    const access = await checkEventAccess(event, eventData.id)
    if (!access?.permissions.canViewTickets) {
      throw createError({
        statusCode: 403,
        message: 'You do not have permission to download these tickets',
      })
    }
  }

  // Only allow download for paid orders
  if (order.paymentStatus !== 'paid') {
    throw createError({
      statusCode: 400,
      message: 'Order is not paid',
    })
  }

  // Fetch all confirmed tickets for this order with their ticket types
  const ticketResults = await db
    .select({
      ticket: tickets,
      ticketType: ticketTypes,
    })
    .from(tickets)
    .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
    .where(
      and(
        eq(tickets.orderId, order.id),
        // Include confirmed and checked_in tickets
      )
    )

  // Filter to only confirmed/checked_in tickets
  const confirmedTickets = ticketResults.filter(
    (t) => t.ticket.status === 'confirmed' || t.ticket.status === 'checked_in'
  )

  if (confirmedTickets.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'No confirmed tickets found for this order',
    })
  }

  // Fetch attendee user emails for tickets with attendeeUserId
  const attendeeUserIds = confirmedTickets
    .map(t => t.ticket.attendeeUserId)
    .filter((id): id is string => id !== null)

  const attendeeUsersMap = new Map<string, string>()
  if (attendeeUserIds.length > 0) {
    const attendeeUsers = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.id, attendeeUserIds))

    for (const u of attendeeUsers) {
      attendeeUsersMap.set(u.id, u.email)
    }
  }

  // Prepare ticket data for PDF generation
  const ticketData = confirmedTickets.map(({ ticket, ticketType }) => {
    // Get attendee email from user record if available
    const attendeeEmail = ticket.attendeeUserId
      ? attendeeUsersMap.get(ticket.attendeeUserId) || null
      : null

    return {
      ticketNumber: ticket.ticketNumber,
      qrCode: ticket.qrCode,
      attendeeName: ticket.attendeeName,
      attendeeEmail,
      ticketTypeName: ticketType.name,
      ticketTypePrice: ticket.pricePaid ?? ticketType.price,
      eventTitle: eventData.title,
      eventDate: eventData.startDate,
      eventEndDate: eventData.endDate,
      eventLocation: eventData.location,
      eventTimezone: eventData.timezone,
      orderNumber: order.orderNumber,
      organizationName: eventData.organizationName,
    }
  })

  // Generate PDF with all tickets
  const pdfBuffer = await generateAllTicketsPdf(ticketData)

  // Set response headers for PDF download
  setResponseHeaders(event, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="tickets-${order.orderNumber}.pdf"`,
    'Content-Length': pdfBuffer.length.toString(),
  })

  return pdfBuffer
})

import { eq } from 'drizzle-orm'
import { tickets, ticketTypes, events, orders, users } from '@nvyt/db'
import { generateTicketPdf } from '~/server/utils/ticketPdf'

export default defineEventHandler(async (event) => {
  const ticketId = getRouterParam(event, 'ticketId')

  if (!ticketId) {
    throw createError({
      statusCode: 400,
      message: 'Ticket ID is required',
    })
  }

  const db = useDatabase()
  const user = await requireAuth(event)

  // Fetch ticket with all related data
  const result = await db
    .select({
      ticket: tickets,
      ticketType: ticketTypes,
      event: events,
      order: orders,
    })
    .from(tickets)
    .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
    .innerJoin(events, eq(tickets.eventId, events.id))
    .innerJoin(orders, eq(tickets.orderId, orders.id))
    .where(eq(tickets.id, ticketId))
    .limit(1)

  const ticketData = result[0]
  if (!ticketData) {
    throw createError({
      statusCode: 404,
      message: 'Ticket not found',
    })
  }

  const { ticket, ticketType, event: eventData, order } = ticketData

  // Check authorization - user must own the ticket or be the event organizer
  const isOwner = ticket.userId === user.id
  const isOrganizer = eventData.organizerId === user.id

  if (!isOwner && !isOrganizer) {
    throw createError({
      statusCode: 403,
      message: 'You do not have permission to download this ticket',
    })
  }

  // Only allow download for confirmed tickets
  if (ticket.status !== 'confirmed' && ticket.status !== 'checked_in') {
    throw createError({
      statusCode: 400,
      message: 'Ticket is not confirmed',
    })
  }

  // Fetch attendee email from user record if attendeeUserId is set
  let attendeeEmail: string | null = null
  if (ticket.attendeeUserId) {
    const [attendeeUser] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, ticket.attendeeUserId))
      .limit(1)
    if (attendeeUser) {
      attendeeEmail = attendeeUser.email
    }
  }

  // Generate PDF
  const pdfBuffer = await generateTicketPdf({
    ticketNumber: ticket.ticketNumber,
    qrCode: ticket.qrCode,
    attendeeName: ticket.attendeeName,
    attendeeEmail,
    ticketTypeName: ticketType.name,
    ticketTypePrice: ticketType.price,
    eventTitle: eventData.title,
    eventDate: eventData.startDate,
    eventEndDate: eventData.endDate,
    eventLocation: eventData.location,
    eventTimezone: eventData.timezone,
    orderNumber: order.orderNumber,
    organizationName: eventData.organizationName,
  })

  // Set response headers for PDF download
  setResponseHeaders(event, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="ticket-${ticket.ticketNumber}.pdf"`,
    'Content-Length': pdfBuffer.length.toString(),
  })

  return pdfBuffer
})

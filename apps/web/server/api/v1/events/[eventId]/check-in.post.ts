import { eq, and } from 'drizzle-orm'
import { events, attendees, users, tickets, ticketTypes, orders } from '@nvyt/db'
import { attendeeCheckInSchema } from '@nvyt/shared'
import { broadcastTicketCheckIn, broadcastAttendeeCheckIn } from '~/server/utils/pusher'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const body = await readBody(event)

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  // Require canCheckIn permission (owner or collaborator)
  await requireEventAccess(event, eventId, 'canCheckIn')

  // Validate input
  const result = attendeeCheckInSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  // Trim whitespace and normalize the QR code
  const qrCode = result.data.qrCode.trim()
  const db = useDatabase()

  console.log(`[Check-in] Event: ${eventId}, QR Code: "${qrCode}" (length: ${qrCode.length})`)

  // Get event data
  const [eventData] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)

  if (!eventData) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  // First, try to find a paid ticket with this QR code
  if (eventData.registrationMode === 'tickets') {
    const [ticketResult] = await db
      .select({
        ticket: tickets,
        ticketType: {
          id: ticketTypes.id,
          name: ticketTypes.name,
          price: ticketTypes.price,
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
          avatarUrl: users.avatarUrl,
        },
      })
      .from(tickets)
      .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
      .innerJoin(orders, eq(tickets.orderId, orders.id))
      .innerJoin(users, eq(tickets.userId, users.id))
      .where(and(eq(tickets.eventId, eventId), eq(tickets.qrCode, qrCode)))
      .limit(1)

    if (ticketResult) {
      // Found a paid ticket
      const { ticket, ticketType, order, purchaser } = ticketResult

      // Check payment status
      if (order.paymentStatus !== 'paid') {
        throw createError({
          statusCode: 400,
          message: `Cannot check in. Payment status is: ${order.paymentStatus}`,
          data: {
            type: 'ticket',
            ticket,
            ticketType,
            order,
            purchaser,
          },
        })
      }

      // Check if already checked in
      if (ticket.checkedInAt) {
        throw createError({
          statusCode: 400,
          message: `Already checked in at ${new Date(ticket.checkedInAt).toLocaleString()}`,
          data: {
            type: 'ticket',
            ticket,
            ticketType,
            order,
            purchaser,
            alreadyCheckedIn: true,
          },
        })
      }

      // Check ticket status
      if (ticket.status !== 'confirmed') {
        throw createError({
          statusCode: 400,
          message: `Cannot check in. Ticket status is: ${ticket.status}`,
          data: {
            type: 'ticket',
            ticket,
            ticketType,
            order,
            purchaser,
          },
        })
      }

      // Perform check-in
      const checkedInAt = new Date()
      await db
        .update(tickets)
        .set({
          status: 'checked_in',
          checkedInAt,
          updatedAt: checkedInAt,
        })
        .where(eq(tickets.id, ticket.id))

      // Broadcast real-time update via Pusher
      broadcastTicketCheckIn({
        orderNumber: order.orderNumber,
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: 'checked_in',
        checkedInAt,
      })

      return successResponse({
        message: 'Check-in successful',
        type: 'ticket',
        ticket: {
          ...ticket,
          status: 'checked_in',
          checkedInAt,
        },
        ticketType,
        order,
        purchaser,
        attendeeName: ticket.attendeeName || order.customerName || purchaser.name,
        attendeeEmail: ticket.attendeeEmail || order.customerEmail || purchaser.email,
      })
    }
  }

  // Try to find a free RSVP attendee with this QR code
  const [attendee] = await db
    .select({
      id: attendees.id,
      status: attendees.status,
      qrCode: attendees.qrCode,
      checkedInAt: attendees.checkedInAt,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(attendees)
    .leftJoin(users, eq(attendees.userId, users.id))
    .where(and(eq(attendees.eventId, eventId), eq(attendees.qrCode, qrCode)))
    .limit(1)

  if (!attendee) {
    // Debug: Check if ticket exists for ANY event
    const [anyTicket] = await db
      .select({
        id: tickets.id,
        eventId: tickets.eventId,
        status: tickets.status,
      })
      .from(tickets)
      .where(eq(tickets.qrCode, qrCode))
      .limit(1)

    if (anyTicket) {
      console.log(`[Check-in] Ticket found but for different event. Ticket eventId: ${anyTicket.eventId}, Current eventId: ${eventId}`)
      throw createError({
        statusCode: 404,
        message: `This ticket belongs to a different event.`,
        data: { ticketEventId: anyTicket.eventId, currentEventId: eventId },
      })
    }

    throw createError({
      statusCode: 404,
      message: `Invalid QR code. No ticket or attendee found. Scanned: "${qrCode.substring(0, 20)}..."`,
    })
  }

  // Check if already checked in
  if (attendee.checkedInAt) {
    throw createError({
      statusCode: 400,
      message: `Already checked in at ${new Date(attendee.checkedInAt).toLocaleString()}`,
      data: {
        type: 'rsvp',
        attendee,
        alreadyCheckedIn: true,
      },
    })
  }

  // Check attendee status
  if (attendee.status !== 'confirmed') {
    throw createError({
      statusCode: 400,
      message: `Cannot check in. Attendee status is: ${attendee.status}`,
      data: {
        type: 'rsvp',
        attendee,
        status: attendee.status,
      },
    })
  }

  // Perform check-in
  const checkedInAt = new Date()
  await db
    .update(attendees)
    .set({
      checkedInAt,
      updatedAt: checkedInAt,
    })
    .where(eq(attendees.id, attendee.id))

  // Broadcast real-time update via Pusher
  if (attendee.user) {
    broadcastAttendeeCheckIn({
      eventId,
      attendeeId: attendee.id,
      userId: attendee.user.id,
      status: 'checked_in',
      checkedInAt,
    })
  }

  return successResponse({
    message: 'Check-in successful',
    type: 'rsvp',
    attendee: {
      ...attendee,
      checkedInAt,
    },
    attendeeName: attendee.user?.name,
    attendeeEmail: attendee.user?.email,
  })
})

import { eq, desc, and, or, count, inArray } from 'drizzle-orm'
import { tickets, ticketTypes, events, orders, users, attendees } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const query = getQuery(event)

  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20))
  const offset = (page - 1) * limit
  const status = query.status as string | undefined
  const eventId = query.eventId as string | undefined
  const type = query.type as string | undefined // 'ticket' | 'rsvp' | undefined (all)

  const db = useDatabase()

  const results: any[] = []

  // Fetch tickets (unless filtering to rsvp only)
  if (type !== 'rsvp') {
    const ticketConditions: any[] = [
      or(
        eq(tickets.userId, user.id),
        eq(tickets.attendeeUserId, user.id)
      ),
    ]
    if (status && ['pending', 'confirmed', 'cancelled', 'checked_in', 'refunded'].includes(status)) {
      ticketConditions.push(eq(tickets.status, status as any))
    }
    if (eventId) {
      ticketConditions.push(eq(tickets.eventId, eventId))
    }

    const userTickets = await db
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
          promoVideoUrl: events.promoVideoUrl,
          startDate: events.startDate,
          endDate: events.endDate,
          timezone: events.timezone,
          location: events.location,
          status: events.status,
        },
        order: {
          id: orders.id,
          orderNumber: orders.orderNumber,
          paymentStatus: orders.paymentStatus,
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
      .where(and(...ticketConditions))
      .orderBy(desc(events.startDate), desc(tickets.createdAt))

    // Fetch attendee emails for tickets with attendeeUserId
    const attendeeUserIds = userTickets
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

    for (const { ticket, ticketType, event: evt, order, purchaser } of userTickets) {
      const attendeeEmail = ticket.attendeeUserId
        ? attendeeEmailsMap.get(ticket.attendeeUserId) || null
        : null

      results.push({
        id: ticket.id,
        type: 'ticket' as const,
        status: ticket.status,
        registeredAt: ticket.createdAt,
        qrCode: ticket.qrCode,
        event: evt,
        // ticket-specific
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        ticketType,
        order,
        purchaser,
        isPurchaser: ticket.userId === user.id,
        attendeeName: ticket.attendeeName,
        attendeeEmail,
      })
    }
  }

  // Fetch RSVPs (unless filtering to ticket only)
  if (type !== 'ticket') {
    const rsvpConditions: any[] = [eq(attendees.userId, user.id)]
    if (status) {
      const rsvpStatusMap: Record<string, string> = {
        confirmed: 'confirmed',
        pending: 'pending',
        cancelled: 'cancelled',
        waitlisted: 'waitlisted',
        declined: 'declined',
      }
      if (rsvpStatusMap[status]) {
        rsvpConditions.push(eq(attendees.status, rsvpStatusMap[status] as any))
      }
    }
    if (eventId) {
      rsvpConditions.push(eq(attendees.eventId, eventId))
    }

    const userRsvps = await db
      .select({
        attendee: attendees,
        event: {
          id: events.id,
          title: events.title,
          slug: events.slug,
          coverImage: events.coverImage,
          promoVideoUrl: events.promoVideoUrl,
          startDate: events.startDate,
          endDate: events.endDate,
          timezone: events.timezone,
          location: events.location,
          status: events.status,
        },
      })
      .from(attendees)
      .innerJoin(events, eq(attendees.eventId, events.id))
      .where(and(...rsvpConditions))
      .orderBy(desc(events.startDate))

    for (const { attendee, event: evt } of userRsvps) {
      results.push({
        id: attendee.id,
        type: 'rsvp' as const,
        status: attendee.status,
        registeredAt: attendee.createdAt,
        qrCode: attendee.qrCode,
        event: evt,
      })
    }
  }

  // Sort all results by event start date descending
  results.sort((a, b) => {
    const dateA = new Date(a.event.startDate).getTime()
    const dateB = new Date(b.event.startDate).getTime()
    return dateB - dateA
  })

  // Paginate
  const total = results.length
  const paginated = results.slice(offset, offset + limit)

  return paginatedResponse(paginated, page, limit, total)
})

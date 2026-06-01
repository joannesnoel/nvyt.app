import { eq, and, desc, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { events, attendees, users, tickets, ticketTypes, orders } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const query = getQuery(event)
  const format = (query.format as string) || 'csv'

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  // Require canManageAttendees permission (owner or collaborator)
  await requireEventAccess(event, eventId, 'canManageAttendees')

  const db = useDatabase()

  // Get event data for export
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

  // Ticket-mode events store attendee data in the tickets table, not the
  // attendees table. The list endpoint switches on registrationMode; mirror
  // that here so the export isn't empty for paid-ticket events.
  if (eventData.registrationMode === 'tickets') {
    const attendeeUsers = alias(users, 'attendee_users')

    const rows = await db
      .select({
        ticketNumber: tickets.ticketNumber,
        ticketTypeName: ticketTypes.name,
        attendeeName: tickets.attendeeName,
        attendeeUserName: attendeeUsers.name,
        attendeeUserEmail: attendeeUsers.email,
        purchaserName: users.name,
        purchaserEmail: users.email,
        customerName: orders.customerName,
        customerEmail: orders.customerEmail,
        orderNumber: orders.orderNumber,
        paymentStatus: orders.paymentStatus,
        status: tickets.status,
        checkedInAt: tickets.checkedInAt,
        createdAt: tickets.createdAt,
      })
      .from(tickets)
      .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
      .innerJoin(orders, eq(tickets.orderId, orders.id))
      .leftJoin(users, eq(tickets.userId, users.id))
      .leftJoin(attendeeUsers, eq(tickets.attendeeUserId, attendeeUsers.id))
      .where(
        and(
          eq(tickets.eventId, eventId),
          inArray(orders.paymentStatus, ['paid', 'pending']),
        )
      )
      .orderBy(desc(tickets.createdAt))

    // Use the same name/email priority as the list view: attendeeName >
    // attendeeUser > order customer > purchaser
    const flattened = rows.map((r) => ({
      ticketNumber: r.ticketNumber,
      ticketType: r.ticketTypeName,
      name:
        r.attendeeName ||
        r.attendeeUserName ||
        r.customerName ||
        r.purchaserName ||
        '',
      email: r.attendeeUserEmail || r.customerEmail || r.purchaserEmail || '',
      purchaserName: r.customerName || r.purchaserName || '',
      purchaserEmail: r.customerEmail || r.purchaserEmail || '',
      orderNumber: r.orderNumber,
      paymentStatus: r.paymentStatus,
      ticketStatus: r.status,
      checkedInAt: r.checkedInAt ? new Date(r.checkedInAt).toISOString() : '',
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    }))

    if (format === 'json') {
      return successResponse({
        event: {
          title: eventData.title,
          slug: eventData.slug,
          startDate: eventData.startDate,
          registrationMode: 'tickets',
        },
        attendees: flattened,
        exportedAt: new Date().toISOString(),
      })
    }

    const headers = [
      'Ticket Number',
      'Ticket Type',
      'Attendee Name',
      'Attendee Email',
      'Purchaser Name',
      'Purchaser Email',
      'Order Number',
      'Payment Status',
      'Ticket Status',
      'Checked In At',
      'Created At',
    ]
    const csvRows = flattened.map((a) => [
      a.ticketNumber,
      a.ticketType,
      a.name,
      a.email,
      a.purchaserName,
      a.purchaserEmail,
      a.orderNumber,
      a.paymentStatus,
      a.ticketStatus,
      a.checkedInAt,
      a.createdAt,
    ])

    const csv = [
      headers.join(','),
      ...csvRows.map((row) =>
        row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','),
      ),
    ].join('\n')

    setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
    setHeader(
      event,
      'Content-Disposition',
      `attachment; filename="${eventData.slug}-attendees.csv"`,
    )

    return csv
  }

  // RSVP mode (unchanged): attendees table holds the records.
  const attendeesList = await db
    .select({
      name: users.name,
      email: users.email,
      status: attendees.status,
      respondedAt: attendees.respondedAt,
      checkedInAt: attendees.checkedInAt,
      notes: attendees.notes,
    })
    .from(attendees)
    .leftJoin(users, eq(attendees.userId, users.id))
    .where(eq(attendees.eventId, eventId))
    .orderBy(attendees.createdAt)

  if (format === 'json') {
    return successResponse({
      event: {
        title: eventData.title,
        slug: eventData.slug,
        startDate: eventData.startDate,
        registrationMode: 'rsvp',
      },
      attendees: attendeesList,
      exportedAt: new Date().toISOString(),
    })
  }

  // CSV format
  const headers = ['Name', 'Email', 'Status', 'Responded At', 'Checked In At', 'Notes']
  const rows = attendeesList.map(a => [
    a.name || '',
    a.email || '',
    a.status,
    a.respondedAt ? new Date(a.respondedAt).toISOString() : '',
    a.checkedInAt ? new Date(a.checkedInAt).toISOString() : '',
    a.notes || '',
  ])

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ].join('\n')

  // Set headers for file download
  setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="${eventData.slug}-attendees.csv"`)

  return csv
})

import { eq, and, gte, sql } from 'drizzle-orm'
import { events, attendees, tickets, orders, ticketTypes } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const db = useDatabase()

  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, message: 'Event ID required' })
  }

  await requireEventAccess(event, eventId, 'canViewAnalytics')

  // Fetch event
  const [eventRecord] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)

  if (!eventRecord) {
    throw createError({ statusCode: 404, message: 'Event not found' })
  }

  const isTicketMode = eventRecord.registrationMode === 'tickets'

  // Read period from query params, default to 7, clamp to allowed values
  const query = getQuery(event)
  const allowedDays = [7, 14, 30, 90]
  const requestedDays = Number(query.days) || 7
  const days = allowedDays.includes(requestedDays) ? requestedDays : 7

  // Get date range for chart
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - (days - 1))
  startDate.setHours(0, 0, 0, 0)

  // Generate all dates in range for consistent x-axis
  const dateLabels: string[] = []
  const currentDate = new Date(startDate)
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  while (currentDate <= today) {
    dateLabels.push(currentDate.toISOString().split('T')[0])
    currentDate.setDate(currentDate.getDate() + 1)
  }

  let registrationsByDay: { date: string; count: number }[] = []
  let periodTotal = 0
  let periodRevenue = 0
  let revenueByMethod: { method: string; amount: number }[] = []
  let ticketTypesSeries: { id: string; name: string; color: string; data: { date: string; count: number }[] }[] = []

  if (isTicketMode) {
    // Get ticket types for this event
    const eventTicketTypes = await db
      .select({
        id: ticketTypes.id,
        name: ticketTypes.name,
      })
      .from(ticketTypes)
      .where(eq(ticketTypes.eventId, eventId))
      .orderBy(ticketTypes.sortOrder)

    // Color palette for ticket types — bold distinct hues for stacked bar readability
    const colors = ['#6366f1', '#10b981', '#f97316', '#ec4899', '#06b6d4', '#a855f7']

    // Get period totals (only paid tickets)
    const [totalStats] = await db
      .select({
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(tickets)
      .innerJoin(orders, eq(tickets.orderId, orders.id))
      .where(
        and(
          eq(tickets.eventId, eventId),
          eq(orders.paymentStatus, 'paid'),
          gte(tickets.createdAt, startDate)
        )
      )

    const [revenueTotal] = await db
      .select({
        amount: sql<number>`COALESCE(SUM(${orders.subtotalAmount}::numeric - ${orders.discountAmount}::numeric), 0)`.as('amount'),
      })
      .from(orders)
      .where(
        and(
          eq(orders.eventId, eventId),
          eq(orders.paymentStatus, 'paid'),
          gte(orders.createdAt, startDate),
          sql`${orders.paymentMethod} is distinct from 'external'`,
        )
      )

    periodTotal = Number(totalStats?.count || 0)
    periodRevenue = Number(revenueTotal?.amount || 0)

    // Get daily ticket sales grouped by ticket type (only paid)
    const ticketStatsByType = await db
      .select({
        date: sql<string>`DATE(${tickets.createdAt})`.as('date'),
        ticketTypeId: tickets.ticketTypeId,
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(tickets)
      .innerJoin(orders, eq(tickets.orderId, orders.id))
      .where(
        and(
          eq(tickets.eventId, eventId),
          eq(orders.paymentStatus, 'paid'),
          gte(tickets.createdAt, startDate)
        )
      )
      .groupBy(sql`DATE(${tickets.createdAt})`, tickets.ticketTypeId)
      .orderBy(sql`DATE(${tickets.createdAt})`)

    // Build series data for each ticket type
    ticketTypesSeries = eventTicketTypes.map((tt, index) => {
      const typeStats = ticketStatsByType.filter(s => s.ticketTypeId === tt.id)
      const statsMap = new Map(typeStats.map(s => [s.date, Number(s.count)]))

      return {
        id: tt.id,
        name: tt.name,
        color: colors[index % colors.length],
        data: dateLabels.map(date => ({
          date,
          count: statsMap.get(date) || 0,
        })),
      }
    })

    // Also compute total registrations by day for backwards compatibility (only paid)
    const ticketStats = await db
      .select({
        date: sql<string>`DATE(${tickets.createdAt})`.as('date'),
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(tickets)
      .innerJoin(orders, eq(tickets.orderId, orders.id))
      .where(
        and(
          eq(tickets.eventId, eventId),
          eq(orders.paymentStatus, 'paid'),
          gte(tickets.createdAt, startDate)
        )
      )
      .groupBy(sql`DATE(${tickets.createdAt})`)
      .orderBy(sql`DATE(${tickets.createdAt})`)

    // Get revenue grouped by payment method (scoped to period)
    const revenueByMethodStats = await db
      .select({
        method: sql<string>`COALESCE(${orders.paymentMethod}, ${orders.paymentProvider}, 'unknown')`.as('method'),
        amount: sql<number>`COALESCE(SUM(${orders.subtotalAmount}::numeric - ${orders.discountAmount}::numeric), 0)`.as('amount'),
      })
      .from(orders)
      .where(
        and(
          eq(orders.eventId, eventId),
          eq(orders.paymentStatus, 'paid'),
          gte(orders.createdAt, startDate),
          sql`${orders.paymentMethod} is distinct from 'external'`,
        )
      )
      .groupBy(sql`COALESCE(${orders.paymentMethod}, ${orders.paymentProvider}, 'unknown')`)
      .orderBy(sql`amount DESC`)

    registrationsByDay = ticketStats.map(r => ({ date: r.date, count: Number(r.count) }))
    revenueByMethod = revenueByMethodStats.map(r => ({ method: r.method, amount: Number(r.amount) }))
  } else {
    // Get period totals for RSVPs
    const [totalStats] = await db
      .select({
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(attendees)
      .where(
        and(
          eq(attendees.eventId, eventId),
          gte(attendees.createdAt, startDate)
        )
      )

    periodTotal = Number(totalStats?.count || 0)

    // RSVP: Get daily RSVPs for chart
    const rsvpStats = await db
      .select({
        date: sql<string>`DATE(${attendees.createdAt})`.as('date'),
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(attendees)
      .where(
        and(
          eq(attendees.eventId, eventId),
          gte(attendees.createdAt, startDate)
        )
      )
      .groupBy(sql`DATE(${attendees.createdAt})`)
      .orderBy(sql`DATE(${attendees.createdAt})`)

    registrationsByDay = rsvpStats.map(r => ({ date: r.date, count: Number(r.count) }))
  }

  // Fill in missing dates with zeros
  const registrationsMap = new Map(registrationsByDay.map(r => [r.date, r.count]))

  const filledRegistrations = dateLabels.map(date => ({
    date,
    count: registrationsMap.get(date) || 0,
  }))

  return {
    data: {
      isTicketMode,
      dateLabels,
      registrations: {
        daily: filledRegistrations,
        periodTotal,
        byTicketType: isTicketMode ? ticketTypesSeries : null,
      },
      revenue: isTicketMode ? {
        periodTotal: periodRevenue,
        byMethod: revenueByMethod,
      } : null,
    },
  }
})

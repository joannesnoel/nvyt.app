import { eq, and, gte, sql } from 'drizzle-orm'
import { events, attendees, tickets, orders, eventCollaborators, ticketTypes } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const db = useDatabase()

  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, message: 'Event ID required' })
  }

  // Fetch event and verify ownership/collaboration
  const [eventRecord] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)

  if (!eventRecord) {
    throw createError({ statusCode: 404, message: 'Event not found' })
  }

  // Check if user is owner or collaborator
  const isOwner = eventRecord.organizerId === user.id
  if (!isOwner) {
    const [collab] = await db
      .select()
      .from(eventCollaborators)
      .where(
        and(
          eq(eventCollaborators.eventId, eventId),
          eq(eventCollaborators.userId, user.id)
        )
      )
      .limit(1)
    if (!collab) {
      throw createError({ statusCode: 403, message: 'Access denied' })
    }
  }

  const isTicketMode = eventRecord.registrationMode === 'tickets'

  // Get date range (last 7 days for chart)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
  sevenDaysAgo.setHours(0, 0, 0, 0)

  // Generate all dates in range for consistent x-axis
  const dateLabels: string[] = []
  const currentDate = new Date(sevenDaysAgo)
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  while (currentDate <= today) {
    dateLabels.push(currentDate.toISOString().split('T')[0])
    currentDate.setDate(currentDate.getDate() + 1)
  }

  let registrationsByDay: { date: string; count: number }[] = []
  let revenueByDay: { date: string; amount: number }[] = []
  let allTimeTotal = 0
  let allTimeRevenue = 0
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

    // Color palette for ticket types
    const colors = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e']

    // Get all-time totals (only paid tickets)
    const [totalStats] = await db
      .select({
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(tickets)
      .innerJoin(orders, eq(tickets.orderId, orders.id))
      .where(
        and(
          eq(tickets.eventId, eventId),
          eq(orders.paymentStatus, 'paid')
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
          eq(orders.paymentStatus, 'paid')
        )
      )

    allTimeTotal = Number(totalStats?.count || 0)
    allTimeRevenue = Number(revenueTotal?.amount || 0)

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
          gte(tickets.createdAt, sevenDaysAgo)
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
          gte(tickets.createdAt, sevenDaysAgo)
        )
      )
      .groupBy(sql`DATE(${tickets.createdAt})`)
      .orderBy(sql`DATE(${tickets.createdAt})`)

    // Get daily revenue from paid orders
    const revenueStats = await db
      .select({
        date: sql<string>`DATE(${orders.createdAt})`.as('date'),
        amount: sql<number>`COALESCE(SUM(${orders.subtotalAmount}::numeric - ${orders.discountAmount}::numeric), 0)`.as('amount'),
      })
      .from(orders)
      .where(
        and(
          eq(orders.eventId, eventId),
          eq(orders.paymentStatus, 'paid'),
          gte(orders.createdAt, sevenDaysAgo)
        )
      )
      .groupBy(sql`DATE(${orders.createdAt})`)
      .orderBy(sql`DATE(${orders.createdAt})`)

    registrationsByDay = ticketStats.map(r => ({ date: r.date, count: Number(r.count) }))
    revenueByDay = revenueStats.map(r => ({ date: r.date, amount: Number(r.amount) }))
  } else {
    // Get all-time totals for RSVPs
    const [totalStats] = await db
      .select({
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(attendees)
      .where(eq(attendees.eventId, eventId))

    allTimeTotal = Number(totalStats?.count || 0)

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
          gte(attendees.createdAt, sevenDaysAgo)
        )
      )
      .groupBy(sql`DATE(${attendees.createdAt})`)
      .orderBy(sql`DATE(${attendees.createdAt})`)

    registrationsByDay = rsvpStats.map(r => ({ date: r.date, count: Number(r.count) }))
  }

  // Fill in missing dates with zeros
  const registrationsMap = new Map(registrationsByDay.map(r => [r.date, r.count]))
  const revenueMap = new Map(revenueByDay.map(r => [r.date, r.amount]))

  const filledRegistrations = dateLabels.map(date => ({
    date,
    count: registrationsMap.get(date) || 0,
  }))

  const filledRevenue = dateLabels.map(date => ({
    date,
    amount: revenueMap.get(date) || 0,
  }))

  // Calculate period totals (last 14 days)
  const periodRegistrations = filledRegistrations.reduce((sum, r) => sum + r.count, 0)
  const periodRevenue = filledRevenue.reduce((sum, r) => sum + r.amount, 0)

  return {
    data: {
      isTicketMode,
      dateLabels,
      registrations: {
        daily: filledRegistrations,
        periodTotal: periodRegistrations,
        allTimeTotal,
        byTicketType: isTicketMode ? ticketTypesSeries : null,
      },
      revenue: isTicketMode ? {
        daily: filledRevenue,
        periodTotal: periodRevenue,
        allTimeTotal: allTimeRevenue,
      } : null,
    },
  }
})

import { eq, and, notExists, desc } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { orders, events, users } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  await requireEventAccess(event, eventId, 'canViewAnalytics')

  const db = useDatabase()

  // Fetch event details for the email
  const [eventData] = await db
    .select({
      title: events.title,
      startDate: events.startDate,
      location: events.location,
      timezone: events.timezone,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)

  if (!eventData) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  // Alias for the correlated subquery
  const paidOrders = alias(orders, 'paid_orders')

  // Find eligible pending orders, joining with users to check account setup status
  const allEligible = await db
    .select({
      orderNumber: orders.orderNumber,
      customerName: orders.customerName,
      customerEmail: orders.customerEmail,
      totalAmount: orders.totalAmount,
      currency: orders.currency,
      userId: orders.userId,
      hasPassword: users.passwordHash,
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(
      and(
        eq(orders.eventId, eventId),
        eq(orders.paymentStatus, 'pending'),
        notExists(
          db
            .select({ id: paidOrders.id })
            .from(paidOrders)
            .where(
              and(
                eq(paidOrders.eventId, eventId),
                eq(paidOrders.userId, orders.userId),
                eq(paidOrders.paymentStatus, 'paid')
              )
            )
        )
      )
    )
    .orderBy(desc(orders.createdAt))

  // Deduplicate: one reminder per customer email (keep the most recent order)
  const seen = new Set<string>()
  const eligibleOrders = allEligible.filter((o) => {
    const key = o.customerEmail.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  if (eligibleOrders.length === 0) {
    return successResponse({ sent: 0, failed: 0, total: 0 })
  }

  // Format event date for email
  const eventDate = new Date(eventData.startDate).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: eventData.timezone || 'Asia/Manila',
  })

  const config = useRuntimeConfig()
  const baseUrl = config.public.appUrl || 'https://nvyt.app'

  let sent = 0
  let failed = 0

  for (const order of eligibleOrders) {
    const totalNum = parseFloat(order.totalAmount)
    const formattedAmount = totalNum === 0
      ? 'Free'
      : new Intl.NumberFormat('en-PH', { style: 'currency', currency: order.currency || 'PHP' }).format(totalNum)

    let emailData: { subject: string; html: string }

    if (!order.hasPassword) {
      // User hasn't set up their account yet — generate a setup token
      // so they can set a password and then complete payment
      const setupToken = await createAccountSetupToken(order.userId)

      emailData = paymentReminderSetupEmail({
        customerName: order.customerName,
        eventTitle: eventData.title,
        eventDate,
        eventLocation: eventData.location || undefined,
        orderNumber: order.orderNumber,
        totalAmount: formattedAmount,
        setupUrl: `${baseUrl}/setup-account?token=${setupToken}`,
      })
    } else {
      emailData = paymentReminderEmail({
        customerName: order.customerName,
        eventTitle: eventData.title,
        eventDate,
        eventLocation: eventData.location || undefined,
        orderNumber: order.orderNumber,
        totalAmount: formattedAmount,
        orderUrl: `${baseUrl}/orders/${order.orderNumber}`,
      })
    }

    const result = await sendEmail({
      to: order.customerEmail,
      subject: emailData.subject,
      html: emailData.html,
    })

    if (result.success) {
      sent++
    } else {
      failed++
      console.error(`[PaymentReminder] Failed to send to ${order.customerEmail}:`, result.error)
    }
  }

  return successResponse({ sent, failed, total: eligibleOrders.length })
})

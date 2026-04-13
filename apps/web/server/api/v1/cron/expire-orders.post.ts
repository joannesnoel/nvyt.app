import { orders, tickets, events, users, ticketTypes, ticketRegistrationFields } from '@nvyt/db'
import { eq, and, lt, sql } from 'drizzle-orm'
import { cancelPendingOrder } from '~/server/utils/orderCleanup'
import { getPaymentIntent, isPaymentSuccessful, getPaymentMethod } from '~/server/utils/paymongo'
import { getPayPalOrder, isCaptureSuccessful } from '~/server/utils/paypal'
import { processPaymentReceived } from '~/server/utils/wallet'
import { sendEmail, paymentSuccessfulEmail } from '~/server/utils/email'
import { getExistingSetupToken } from '~/server/utils/auth'

const STALE_ORDER_THRESHOLD_HOURS = 2

/**
 * Check with the payment provider whether this order was actually paid.
 * Returns the payment method string if paid, or null if not.
 */
async function verifyWithProvider(order: {
  paymentProvider: string | null
  paymongoPaymentIntentId: string | null
  paypalOrderId: string | null
}): Promise<{ paid: boolean; paymentMethod: string | null }> {
  if (order.paymentProvider === 'paypal' && order.paypalOrderId) {
    const paypalOrder = await getPayPalOrder(order.paypalOrderId)
    return { paid: isCaptureSuccessful(paypalOrder), paymentMethod: 'paypal' }
  }

  if (order.paymongoPaymentIntentId) {
    const paymentIntent = await getPaymentIntent(order.paymongoPaymentIntentId)
    return { paid: isPaymentSuccessful(paymentIntent), paymentMethod: getPaymentMethod(paymentIntent) }
  }

  return { paid: false, paymentMethod: null }
}

/**
 * Mark an order as paid, confirm tickets, record wallet transaction, and send email.
 */
async function fulfillPaidOrder(
  order: typeof orders.$inferSelect,
  evt: { id: string; title: string; startDate: Date; location: string | null; organizerId: string | null; timezone: string },
  paymentMethod: string | null,
) {
  const db = useDatabase()
  const config = useRuntimeConfig()

  // Mark order as paid
  await db
    .update(orders)
    .set({
      paymentStatus: 'paid',
      paidAt: new Date(),
      paymentMethod,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, order.id))

  // Confirm tickets
  await db
    .update(tickets)
    .set({ status: 'confirmed', updatedAt: new Date() })
    .where(eq(tickets.orderId, order.id))

  // Record wallet transaction
  if (evt.organizerId) {
    try {
      await processPaymentReceived({
        userId: evt.organizerId,
        orderId: order.id,
        eventId: order.eventId,
        grossAmount: Number(order.totalAmount),
        totalFees: Number(order.totalFees),
        netAmount: Number(order.subtotalAmount) - Number(order.discountAmount),
        eventTitle: evt.title,
      })
    } catch (walletErr) {
      console.error(`[Cron] Wallet error for ${order.orderNumber}:`, walletErr)
    }
  }

  // Send confirmation email
  try {
    const orderTickets = await db
      .select({
        id: tickets.id,
        ticketTypeId: tickets.ticketTypeId,
        ticketTypeName: ticketTypes.name,
      })
      .from(tickets)
      .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
      .where(eq(tickets.orderId, order.id))

    const [customer] = await db
      .select()
      .from(users)
      .where(eq(users.id, order.userId))
      .limit(1)

    if (customer) {
      const [registrationFieldCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(ticketRegistrationFields)
        .where(
          and(
            eq(ticketRegistrationFields.eventId, order.eventId),
            eq(ticketRegistrationFields.isActive, true)
          )
        )
      const requiresRegistration = (registrationFieldCount?.count ?? 0) > 0

      const eventDate = new Date(evt.startDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: evt.timezone || 'Asia/Manila',
      })

      const orderUrl = `${config.public.appUrl}/orders/${order.orderNumber}`
      const totalAmount = new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
      }).format(Number(order.totalAmount))

      let setupToken: string | undefined
      if (!customer.passwordHash) {
        const existing = await getExistingSetupToken(customer.id)
        setupToken = existing ?? undefined
      }

      const ticketSummaryMap = new Map<string, { ticketType: string; quantity: number }>()
      for (const t of orderTickets) {
        const existing = ticketSummaryMap.get(t.ticketTypeId)
        if (existing) {
          existing.quantity++
        } else {
          ticketSummaryMap.set(t.ticketTypeId, { ticketType: t.ticketTypeName, quantity: 1 })
        }
      }

      const emailContent = paymentSuccessfulEmail({
        userName: customer.name || 'there',
        eventTitle: evt.title,
        eventDate,
        eventLocation: evt.location || undefined,
        orderNumber: order.orderNumber,
        ticketCount: orderTickets.length,
        ticketSummary: Array.from(ticketSummaryMap.values()),
        totalAmount,
        orderUrl,
        setupToken,
        requiresRegistration,
      })

      await sendEmail({ to: customer.email, ...emailContent })
      console.log(`[Cron] Sent payment confirmation email for order ${order.orderNumber}`)
    }
  } catch (emailErr) {
    console.error(`[Cron] Email error for ${order.orderNumber}:`, emailErr)
  }
}

export default defineEventHandler(async (event) => {
  // Authenticate with cron secret
  const config = useRuntimeConfig()
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!config.cronSecret || token !== config.cronSecret) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    })
  }

  const db = useDatabase()
  const cutoff = new Date(Date.now() - STALE_ORDER_THRESHOLD_HOURS * 60 * 60 * 1000)

  // Find all stale pending orders with event info
  const stalePendingOrders = await db
    .select({
      order: orders,
      event: {
        id: events.id,
        title: events.title,
        startDate: events.startDate,
        location: events.location,
        organizerId: events.organizerId,
        timezone: events.timezone,
      },
    })
    .from(orders)
    .innerJoin(events, eq(orders.eventId, events.id))
    .where(
      and(
        eq(orders.paymentStatus, 'pending'),
        lt(orders.createdAt, cutoff)
      )
    )

  const expiredOrderNumbers: string[] = []
  const reconciledOrderNumbers: string[] = []
  const failedOrderNumbers: string[] = []

  for (const { order: pendingOrder, event: evt } of stalePendingOrders) {
    try {
      // Verify with payment provider before expiring
      const { paid, paymentMethod } = await verifyWithProvider(pendingOrder)

      if (paid) {
        // Payment actually succeeded — fulfill the order instead of expiring it
        await fulfillPaidOrder(pendingOrder, evt, paymentMethod)
        reconciledOrderNumbers.push(pendingOrder.orderNumber)
        console.log(`[Cron] Reconciled paid order ${pendingOrder.orderNumber} (provider confirmed payment)`)
        continue
      }

      await cancelPendingOrder(pendingOrder)
      expiredOrderNumbers.push(pendingOrder.orderNumber)
      console.log(`[Cron] Expired stale pending order ${pendingOrder.orderNumber}`)
    } catch (error) {
      failedOrderNumbers.push(pendingOrder.orderNumber)
      console.error(`[Cron] Failed to process order ${pendingOrder.orderNumber}:`, error)
    }
  }

  console.log(
    `[Cron] Expired ${expiredOrderNumbers.length}, reconciled ${reconciledOrderNumbers.length}, ${failedOrderNumbers.length} failed`
  )

  return successResponse({
    expiredCount: expiredOrderNumbers.length,
    expiredOrders: expiredOrderNumbers,
    reconciledCount: reconciledOrderNumbers.length,
    reconciledOrders: reconciledOrderNumbers,
    failedCount: failedOrderNumbers.length,
    failedOrders: failedOrderNumbers,
  })
})

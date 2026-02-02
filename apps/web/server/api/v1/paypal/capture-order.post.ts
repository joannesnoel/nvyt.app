import { orders, tickets, events, users, ticketTypes, ticketRegistrationFields } from '@nvyt/db'
import { eq, and, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  capturePayPalOrder,
  isCaptureSuccessful,
  getCaptureId,
} from '~/server/utils/paypal'
import {
  sendEmail,
  paymentSuccessfulEmail,
} from '~/server/utils/email'
import { getExistingSetupToken } from '~/server/utils/auth'
import { processPaymentReceived } from '~/server/utils/wallet'

const capturePayPalOrderSchema = z.object({
  paypalOrderId: z.string(),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // Validate input
  const result = capturePayPalOrderSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const { paypalOrderId } = result.data
  const db = useDatabase()
  const config = useRuntimeConfig()

  // Find order by PayPal order ID
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.paypalOrderId, paypalOrderId))
    .limit(1)

  if (!order) {
    throw createError({
      statusCode: 404,
      message: 'Order not found',
    })
  }

  // Check if already paid
  if (order.paymentStatus === 'paid') {
    return successResponse({
      orderId: order.id,
      orderNumber: order.orderNumber,
      alreadyPaid: true,
      message: 'Payment already completed',
    })
  }

  // Capture the PayPal order
  let paypalOrder
  try {
    paypalOrder = await capturePayPalOrder(paypalOrderId)
  } catch (error: any) {
    console.error('[PayPal] Capture failed:', error)

    // Update order to failed
    await db
      .update(orders)
      .set({
        paymentStatus: 'failed',
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))

    throw createError({
      statusCode: 400,
      message: error.message || 'Payment capture failed',
    })
  }

  // Check if capture was successful
  if (!isCaptureSuccessful(paypalOrder)) {
    await db
      .update(orders)
      .set({
        paymentStatus: 'failed',
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))

    throw createError({
      statusCode: 400,
      message: 'Payment was not approved',
    })
  }

  const captureId = getCaptureId(paypalOrder)

  // Update order status to paid
  await db
    .update(orders)
    .set({
      paymentStatus: 'paid',
      paidAt: new Date(),
      paypalCaptureId: captureId,
      paymentMethod: 'paypal',
      updatedAt: new Date(),
    })
    .where(eq(orders.id, order.id))

  // Confirm all tickets in this order
  await db
    .update(tickets)
    .set({
      status: 'confirmed',
      updatedAt: new Date(),
    })
    .where(eq(tickets.orderId, order.id))

  console.log(`[PayPal] Order ${order.orderNumber} marked as paid`)

  // Record financial transaction for the event organizer
  try {
    const [eventInfo] = await db
      .select({
        id: events.id,
        title: events.title,
        organizerId: events.organizerId,
      })
      .from(events)
      .where(eq(events.id, order.eventId))
      .limit(1)

    if (eventInfo && eventInfo.organizerId) {
      const grossAmount = Number(order.totalAmount)

      const walletResult = await processPaymentReceived({
        userId: eventInfo.organizerId,
        orderId: order.id,
        eventId: order.eventId,
        grossAmount,
        totalFees: Number(order.totalFees),
        netAmount: Number(order.subtotalAmount) - Number(order.discountAmount),
        eventTitle: eventInfo.title,
      })

      console.log(
        `[PayPal] Recorded transaction for organizer ${eventInfo.organizerId}: ` +
          `Gross=${grossAmount}, Fees=${walletResult.totalFees}, Net=${walletResult.netAmount}`
      )
    }
  } catch (walletErr) {
    console.error('[PayPal] Failed to record wallet transaction:', walletErr)
  }

  // Send payment confirmation email
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

    const [eventData] = await db
      .select()
      .from(events)
      .where(eq(events.id, order.eventId))
      .limit(1)

    const [customer] = await db
      .select()
      .from(users)
      .where(eq(users.id, order.userId))
      .limit(1)

    // Check if event has active registration fields
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

    if (eventData && customer) {
      const eventDate = new Date(eventData.startDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })

      const orderUrl = `${config.public.appUrl}/orders/${order.orderNumber}`

      const totalAmount = new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: order.currency,
      }).format(Number(order.totalAmount))

      let setupToken: string | undefined
      if (!customer.passwordHash) {
        const existingToken = await getExistingSetupToken(customer.id)
        setupToken = existingToken ?? undefined
      }

      // Build ticket summary (group by ticket type)
      const ticketSummaryMap = new Map<string, { ticketType: string; quantity: number }>()
      for (const t of orderTickets) {
        const existing = ticketSummaryMap.get(t.ticketTypeId)
        if (existing) {
          existing.quantity++
        } else {
          ticketSummaryMap.set(t.ticketTypeId, { ticketType: t.ticketTypeName, quantity: 1 })
        }
      }
      const ticketSummary = Array.from(ticketSummaryMap.values())

      const emailContent = paymentSuccessfulEmail({
        userName: customer.name || 'there',
        eventTitle: eventData.title,
        eventDate,
        eventLocation: eventData.location || undefined,
        orderNumber: order.orderNumber,
        ticketCount: orderTickets.length,
        ticketSummary,
        totalAmount,
        orderUrl,
        setupToken,
        requiresRegistration,
      })

      await sendEmail({ to: customer.email, ...emailContent })
      console.log(`[PayPal] Sent payment confirmation email for order ${order.orderNumber}`)
    }
  } catch (emailErr) {
    console.error('[PayPal] Failed to send confirmation email:', emailErr)
  }

  return successResponse({
    orderId: order.id,
    orderNumber: order.orderNumber,
    captureId,
    message: 'Payment captured successfully',
  })
})

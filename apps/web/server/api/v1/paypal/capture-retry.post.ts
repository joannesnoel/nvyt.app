import { orders, tickets, events } from '@nvyt/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  getPayPalOrder,
  capturePayPalOrder,
  isCaptureSuccessful,
  getCaptureId,
} from '~/server/utils/paypal'
import { sendEmail, ticketPurchaseConfirmationEmail } from '~/server/utils/email'
import { processPaymentReceived } from '~/server/utils/wallet'

const captureRetrySchema = z.object({
  paypalOrderId: z.string(),
  orderNumber: z.string(),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const result = captureRetrySchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
    })
  }

  const { paypalOrderId, orderNumber } = result.data
  const db = useDatabase()
  const config = useRuntimeConfig()

  // Get the order
  const [orderResult] = await db
    .select({
      order: orders,
      event: events,
    })
    .from(orders)
    .innerJoin(events, eq(orders.eventId, events.id))
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1)

  if (!orderResult) {
    throw createError({
      statusCode: 404,
      message: 'Order not found',
    })
  }

  // Verify this PayPal order ID matches what we stored
  if (orderResult.order.paypalOrderId !== paypalOrderId) {
    throw createError({
      statusCode: 400,
      message: 'PayPal order mismatch',
    })
  }

  // Check if already paid
  if (orderResult.order.paymentStatus === 'paid') {
    return successResponse({
      orderNumber: orderResult.order.orderNumber,
      alreadyPaid: true,
      message: 'This order has already been paid.',
    })
  }

  // Get PayPal order details
  const paypalOrder = await getPayPalOrder(paypalOrderId)

  // Check if already captured
  if (paypalOrder.status === 'COMPLETED') {
    // Update our database and return success
    await db
      .update(orders)
      .set({
        paymentStatus: 'paid',
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderResult.order.id))

    await db
      .update(tickets)
      .set({
        status: 'confirmed',
        updatedAt: new Date(),
      })
      .where(eq(tickets.orderId, orderResult.order.id))

    return successResponse({
      orderNumber: orderResult.order.orderNumber,
      alreadyPaid: true,
      message: 'Payment has been confirmed.',
    })
  }

  if (paypalOrder.status !== 'APPROVED') {
    throw createError({
      statusCode: 400,
      message: 'PayPal order not approved',
    })
  }

  // Capture the PayPal payment
  let capturedOrder
  try {
    capturedOrder = await capturePayPalOrder(paypalOrderId)
  } catch (error: any) {
    console.error('[PayPal Capture Retry] Capture failed:', error)
    throw createError({
      statusCode: 400,
      message: error.message || 'Payment capture failed',
    })
  }

  if (!isCaptureSuccessful(capturedOrder)) {
    throw createError({
      statusCode: 400,
      message: 'Payment was not completed',
    })
  }

  const captureId = getCaptureId(capturedOrder)

  // Update order to paid
  await db
    .update(orders)
    .set({
      paypalCaptureId: captureId,
      paymentStatus: 'paid',
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderResult.order.id))

  // Confirm tickets
  await db
    .update(tickets)
    .set({
      status: 'confirmed',
      updatedAt: new Date(),
    })
    .where(eq(tickets.orderId, orderResult.order.id))

  // Record financial transaction
  try {
    if (orderResult.event.organizerId) {
      const grossAmount = parseFloat(orderResult.order.totalAmount)
      const walletResult = await processPaymentReceived({
        userId: orderResult.event.organizerId,
        orderId: orderResult.order.id,
        eventId: orderResult.order.eventId,
        grossAmount,
        eventTitle: orderResult.event.title,
      })

      console.log(
        `[PayPal Capture Retry] Recorded transaction for organizer ${orderResult.event.organizerId}: ` +
          `Gross=${grossAmount}, Fee=${walletResult.platformFee}, Net=${walletResult.netAmount}`
      )
    }
  } catch (walletErr) {
    console.error('[PayPal Capture Retry] Failed to record wallet transaction:', walletErr)
  }

  // Get tickets for email
  const orderTickets = await db
    .select()
    .from(tickets)
    .where(eq(tickets.orderId, orderResult.order.id))

  // Send confirmation email
  try {
    const appUrl = config.public.appUrl as string
    const eventDate = new Date(orderResult.event.startDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })

    const totalAmount = new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
    }).format(parseFloat(orderResult.order.totalAmount))

    const emailContent = ticketPurchaseConfirmationEmail({
      userName: orderResult.order.customerName || 'there',
      eventTitle: orderResult.event.title,
      eventDate,
      eventLocation: orderResult.event.location || undefined,
      orderNumber: orderResult.order.orderNumber,
      tickets: orderTickets.map((t) => ({
        ticketType: t.ticketTypeId, // Will be resolved in email template
        attendeeName: orderResult.order.customerName || 'Guest',
        qrCode: t.qrCode,
      })),
      totalAmount,
      orderUrl: `${appUrl}/orders/${orderResult.order.orderNumber}`,
    })

    await sendEmail({ to: orderResult.order.customerEmail, ...emailContent })
    console.log(`[PayPal Capture Retry] Sent confirmation email for order ${orderResult.order.orderNumber}`)
  } catch (emailErr) {
    console.error('[PayPal Capture Retry] Failed to send email:', emailErr)
  }

  return successResponse({
    orderNumber: orderResult.order.orderNumber,
    message: 'Payment completed successfully',
  })
})

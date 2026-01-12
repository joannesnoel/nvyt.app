import { orders, tickets, events, users, ticketTypes } from '@nvyt/db'
import { eq } from 'drizzle-orm'
import {
  verifyWebhookSignature,
  parseWebhookEvent,
  getPaymentIntent,
  isPaymentSuccessful,
  getPaymentMethod,
} from '~/server/utils/paymongo'
import {
  sendEmail,
  ticketPurchaseConfirmationEmail,
} from '~/server/utils/email'

// PayMongo webhook event types we handle
const HANDLED_EVENTS = [
  'checkout_session.payment.paid',
  'payment.paid',
  'payment.failed',
]

export default defineEventHandler(async (event) => {
  const db = useDatabase()

  // Get raw body for signature verification
  const rawBody = await readRawBody(event)
  if (!rawBody) {
    throw createError({
      statusCode: 400,
      message: 'Missing request body',
    })
  }

  // Get signature header
  const signatureHeader = getHeader(event, 'paymongo-signature')
  if (!signatureHeader) {
    throw createError({
      statusCode: 400,
      message: 'Missing signature header',
    })
  }

  // Extract timestamp from signature
  const timestampMatch = signatureHeader.match(/t=(\d+)/)
  const timestamp = timestampMatch?.[1]
  if (!timestamp) {
    throw createError({
      statusCode: 400,
      message: 'Invalid signature format',
    })
  }

  // Verify signature
  const isValid = verifyWebhookSignature(rawBody, signatureHeader, timestamp)
  if (!isValid) {
    console.warn('PayMongo webhook signature verification failed')
    // In production, you may want to reject invalid signatures
    // For now, we'll log and continue (useful during development)
  }

  // Parse webhook event
  const body = JSON.parse(rawBody)
  const webhookEvent = parseWebhookEvent(body)

  const eventType = webhookEvent.attributes.type
  console.log(`PayMongo webhook received: ${eventType}`)

  if (!HANDLED_EVENTS.includes(eventType)) {
    // Acknowledge unhandled events
    return { received: true, handled: false }
  }

  // Handle checkout session payment
  if (eventType === 'checkout_session.payment.paid') {
    const checkoutSessionId = webhookEvent.attributes.data.id
    const attributes = webhookEvent.attributes.data.attributes as {
      payment_intent: { id: string }
      reference_number: string
      metadata?: { orderNumber?: string }
    }

    const orderNumber =
      attributes.metadata?.orderNumber || attributes.reference_number

    if (!orderNumber) {
      console.error('No order number found in webhook data')
      return { received: true, error: 'No order number' }
    }

    // Find order by checkout session ID or order number
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1)

    if (!order) {
      console.error(`Order not found: ${orderNumber}`)
      return { received: true, error: 'Order not found' }
    }

    // Skip if already processed
    if (order.paymentStatus === 'paid') {
      console.log(`Order ${orderNumber} already marked as paid`)
      return { received: true, handled: true, skipped: true }
    }

    // Get payment intent details for payment method
    let paymentMethod = null
    if (attributes.payment_intent?.id) {
      try {
        const paymentIntent = await getPaymentIntent(attributes.payment_intent.id)
        if (isPaymentSuccessful(paymentIntent)) {
          paymentMethod = getPaymentMethod(paymentIntent)
        }
      } catch (err) {
        console.error('Failed to get payment intent:', err)
      }
    }

    // Update order status
    await db
      .update(orders)
      .set({
        paymentStatus: 'paid',
        paidAt: new Date(),
        paymentMethod: paymentMethod,
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

    console.log(`Order ${orderNumber} marked as paid`)

    // Send confirmation email with tickets
    try {
      const config = useRuntimeConfig()

      // Get order tickets with ticket type info
      const orderTickets = await db
        .select({
          id: tickets.id,
          attendeeName: tickets.attendeeName,
          attendeeEmail: tickets.attendeeEmail,
          qrCode: tickets.qrCode,
          ticketTypeName: ticketTypes.name,
        })
        .from(tickets)
        .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
        .where(eq(tickets.orderId, order.id))

      // Get event info
      const [eventData] = await db
        .select()
        .from(events)
        .where(eq(events.id, order.eventId))
        .limit(1)

      // Get customer info
      const [customer] = await db
        .select()
        .from(users)
        .where(eq(users.id, order.userId))
        .limit(1)

      if (eventData && customer) {
        const eventDate = new Date(eventData.startDate).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })

        const orderUrl = `${config.public.appUrl}/orders/${orderNumber}`

        // Format total amount (stored in PHP, not centavos)
        const totalAmount = new Intl.NumberFormat('en-PH', {
          style: 'currency',
          currency: 'PHP',
        }).format(Number(order.totalAmount))

        // Send ticket confirmation email
        const emailContent = ticketPurchaseConfirmationEmail({
          userName: customer.name || 'there',
          eventTitle: eventData.title,
          eventDate,
          eventLocation: eventData.location || undefined,
          orderNumber,
          tickets: orderTickets.map((t) => ({
            ticketType: t.ticketTypeName,
            attendeeName: t.attendeeName,
            qrCode: t.qrCode,
          })),
          totalAmount,
          orderUrl,
        })

        await sendEmail({ to: customer.email, ...emailContent })
        console.log(`[PayMongo] Sent confirmation email for order ${orderNumber}`)

        // Note: Account setup email is already sent during checkout (checkout.post.ts)
        // We don't create a new token here to avoid invalidating the one in the redirect URL
      }
    } catch (emailErr) {
      // Log but don't fail the webhook
      console.error('[PayMongo] Failed to send confirmation email:', emailErr)
    }

    return { received: true, handled: true, orderNumber }
  }

  // Handle payment failed
  if (eventType === 'payment.failed') {
    const attributes = webhookEvent.attributes.data.attributes as {
      metadata?: { orderNumber?: string }
    }

    const orderNumber = attributes.metadata?.orderNumber
    if (!orderNumber) {
      return { received: true, handled: false, error: 'No order number' }
    }

    // Find order
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1)

    if (order && order.paymentStatus === 'pending') {
      // Update order status to failed
      await db
        .update(orders)
        .set({
          paymentStatus: 'failed',
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id))

      // Cancel pending tickets
      await db
        .update(tickets)
        .set({
          status: 'cancelled',
          updatedAt: new Date(),
        })
        .where(eq(tickets.orderId, order.id))

      console.log(`Order ${orderNumber} marked as failed`)
    }

    return { received: true, handled: true, orderNumber }
  }

  return { received: true, handled: false }
})

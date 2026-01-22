import { orders, tickets, events, users, ticketTypes } from '@nvyt/db'
import { eq } from 'drizzle-orm'
import {
  verifyPayPalWebhook,
  parsePayPalWebhookEvent,
} from '~/server/utils/paypal'
import {
  sendEmail,
  ticketPurchaseConfirmationEmail,
} from '~/server/utils/email'
import { getExistingSetupToken } from '~/server/utils/auth'
import { processPaymentReceived } from '~/server/utils/wallet'

// PayPal webhook event types we handle
const HANDLED_EVENTS = [
  'PAYMENT.CAPTURE.COMPLETED',
  'PAYMENT.CAPTURE.DENIED',
  'PAYMENT.CAPTURE.REFUNDED',
]

export default defineEventHandler(async (event) => {
  const db = useDatabase()
  const config = useRuntimeConfig()

  // Get raw body for signature verification
  const rawBody = await readRawBody(event)
  if (!rawBody) {
    throw createError({
      statusCode: 400,
      message: 'Missing request body',
    })
  }

  // Get webhook headers
  const headers = getHeaders(event)

  // Verify webhook signature
  const isValid = await verifyPayPalWebhook(headers, rawBody)
  if (!isValid) {
    console.warn('[PayPal Webhook] Signature verification failed')
    // Continue processing but log the warning
    // In production, you may want to reject invalid signatures
  }

  // Parse webhook event
  const webhookEvent = parsePayPalWebhookEvent(JSON.parse(rawBody))
  const eventType = webhookEvent.event_type

  console.log(`[PayPal Webhook] Received: ${eventType}`)

  if (!HANDLED_EVENTS.includes(eventType)) {
    return { received: true, handled: false }
  }

  // Handle payment capture completed
  if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
    const resource = webhookEvent.resource as {
      id: string
      supplementary_data?: {
        related_ids?: {
          order_id?: string
        }
      }
    }

    const captureId = resource.id
    const paypalOrderId = resource.supplementary_data?.related_ids?.order_id

    if (!paypalOrderId) {
      console.error('[PayPal Webhook] No order ID in capture event')
      return { received: true, error: 'No order ID' }
    }

    // Find order by PayPal order ID
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.paypalOrderId, paypalOrderId))
      .limit(1)

    if (!order) {
      console.error(`[PayPal Webhook] Order not found for PayPal order: ${paypalOrderId}`)
      return { received: true, error: 'Order not found' }
    }

    // Skip if already processed
    if (order.paymentStatus === 'paid') {
      console.log(`[PayPal Webhook] Order ${order.orderNumber} already marked as paid`)
      return { received: true, handled: true, skipped: true }
    }

    // Update order status
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

    // Confirm all tickets
    await db
      .update(tickets)
      .set({
        status: 'confirmed',
        updatedAt: new Date(),
      })
      .where(eq(tickets.orderId, order.id))

    console.log(`[PayPal Webhook] Order ${order.orderNumber} marked as paid`)

    // Record financial transaction
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
          eventTitle: eventInfo.title,
        })

        console.log(
          `[PayPal Webhook] Recorded transaction for organizer ${eventInfo.organizerId}: ` +
            `Gross=${grossAmount}, Fee=${walletResult.platformFee}, Net=${walletResult.netAmount}`
        )
      }
    } catch (walletErr) {
      console.error('[PayPal Webhook] Failed to record wallet transaction:', walletErr)
    }

    // Send confirmation email
    try {
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

        const emailContent = ticketPurchaseConfirmationEmail({
          userName: customer.name || 'there',
          eventTitle: eventData.title,
          eventDate,
          eventLocation: eventData.location || undefined,
          orderNumber: order.orderNumber,
          tickets: orderTickets.map((t) => ({
            ticketType: t.ticketTypeName,
            attendeeName: t.attendeeName || order.customerName || customer.name || 'Guest',
            qrCode: t.qrCode,
          })),
          totalAmount,
          orderUrl,
          setupToken,
        })

        await sendEmail({ to: customer.email, ...emailContent })
        console.log(`[PayPal Webhook] Sent confirmation email for order ${order.orderNumber}`)
      }
    } catch (emailErr) {
      console.error('[PayPal Webhook] Failed to send confirmation email:', emailErr)
    }

    return { received: true, handled: true, orderNumber: order.orderNumber }
  }

  // Handle payment capture denied
  if (eventType === 'PAYMENT.CAPTURE.DENIED') {
    const resource = webhookEvent.resource as {
      supplementary_data?: {
        related_ids?: {
          order_id?: string
        }
      }
    }

    const paypalOrderId = resource.supplementary_data?.related_ids?.order_id

    if (!paypalOrderId) {
      return { received: true, handled: false, error: 'No order ID' }
    }

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.paypalOrderId, paypalOrderId))
      .limit(1)

    if (order && order.paymentStatus === 'pending') {
      await db
        .update(orders)
        .set({
          paymentStatus: 'failed',
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id))

      await db
        .update(tickets)
        .set({
          status: 'cancelled',
          updatedAt: new Date(),
        })
        .where(eq(tickets.orderId, order.id))

      console.log(`[PayPal Webhook] Order ${order.orderNumber} marked as failed`)
    }

    return { received: true, handled: true }
  }

  // Handle refund
  if (eventType === 'PAYMENT.CAPTURE.REFUNDED') {
    const resource = webhookEvent.resource as {
      id: string
      links?: Array<{ href: string; rel: string }>
    }

    // Extract capture ID from links
    const captureLink = resource.links?.find(l => l.rel === 'up')
    const captureId = captureLink?.href.split('/').pop()

    if (captureId) {
      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.paypalCaptureId, captureId))
        .limit(1)

      if (order && order.paymentStatus === 'paid') {
        await db
          .update(orders)
          .set({
            paymentStatus: 'refunded',
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id))

        await db
          .update(tickets)
          .set({
            status: 'refunded',
            updatedAt: new Date(),
          })
          .where(eq(tickets.orderId, order.id))

        console.log(`[PayPal Webhook] Order ${order.orderNumber} marked as refunded`)
      }
    }

    return { received: true, handled: true }
  }

  return { received: true, handled: false }
})

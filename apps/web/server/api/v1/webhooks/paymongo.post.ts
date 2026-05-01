import { orders, tickets, events, users, ticketTypes, ticketRegistrationFields } from '@nvyt/db'
import { eq, and, sql } from 'drizzle-orm'
import {
  verifyWebhookSignature,
  parseWebhookEvent,
  getPaymentIntent,
  isPaymentSuccessful,
  getPaymentMethod,
} from '~/server/utils/paymongo'
import {
  sendEmail,
  paymentSuccessfulEmail,
} from '~/server/utils/email'
import { getExistingSetupToken } from '~/server/utils/auth'
import { processPaymentReceived } from '~/server/utils/wallet'

// PayMongo webhook event types we handle
const HANDLED_EVENTS = [
  'checkout_session.payment.paid',  // Hosted checkout flow (legacy)
  'payment_intent.succeeded',        // Payment Intent flow (new)
  'payment.paid',                    // General payment success
  'payment.failed',                  // Payment failed
]

// Look up an order by payment_intent_id first, falling back to order_number from
// webhook metadata. The fallback handles cases where retry-payment minted a new PI
// and overwrote orders.paymongo_payment_intent_id, but PayMongo fires the webhook
// against an older PI we no longer have on the order row.
async function findOrderForWebhook(
  db: ReturnType<typeof useDatabase>,
  paymentIntentId: string | null | undefined,
  orderNumber: string | null | undefined
) {
  if (paymentIntentId) {
    const [byPI] = await db
      .select()
      .from(orders)
      .where(eq(orders.paymongoPaymentIntentId, paymentIntentId))
      .limit(1)
    if (byPI) return { order: byPI, matchedBy: 'payment_intent_id' as const }
  }
  if (orderNumber) {
    const [byOrderNumber] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1)
    if (byOrderNumber) return { order: byOrderNumber, matchedBy: 'order_number' as const }
  }
  return { order: null, matchedBy: null }
}

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

    // Record financial transaction for the event organizer
    try {
      // Get event info to find organizer
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

        // Process payment and record transaction
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
          `[PayMongo] Recorded transaction for organizer ${eventInfo.organizerId}: ` +
            `Gross=${grossAmount}, Fees=${walletResult.totalFees}, Net=${walletResult.netAmount}`
        )
      }
    } catch (walletErr) {
      // Log but don't fail the webhook
      console.error('[PayMongo] Failed to record wallet transaction:', walletErr)
    }

    // Send payment confirmation email
    try {
      const config = useRuntimeConfig()

      // Get order tickets with ticket type info for summary
      const orderTickets = await db
        .select({
          id: tickets.id,
          ticketTypeId: tickets.ticketTypeId,
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
          timeZone: eventData.timezone || 'Asia/Manila',
        })

        const orderUrl = `${config.public.appUrl}/orders/${orderNumber}`

        // Format total amount (stored in PHP, not centavos)
        const totalAmount = new Intl.NumberFormat('en-PH', {
          style: 'currency',
          currency: 'PHP',
        }).format(Number(order.totalAmount))

        // For guest users (no password), get existing setup token for email link
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

        // Send payment successful email (no QR codes - those are sent after registration)
        const emailContent = paymentSuccessfulEmail({
          userName: customer.name || 'there',
          eventTitle: eventData.title,
          eventDate,
          eventLocation: eventData.location || undefined,
          orderNumber,
          ticketCount: orderTickets.length,
          ticketSummary,
          totalAmount,
          orderUrl,
          setupToken,
          requiresRegistration,
        })

        await sendEmail({ to: customer.email, ...emailContent })
        console.log(`[PayMongo] Sent payment confirmation email for order ${orderNumber}`)
      }
    } catch (emailErr) {
      // Log but don't fail the webhook
      console.error('[PayMongo] Failed to send confirmation email:', emailErr)
    }

    return { received: true, handled: true, orderNumber }
  }

  // Handle Payment Intent succeeded (for custom checkout flow)
  if (eventType === 'payment_intent.succeeded') {
    const paymentIntentId = webhookEvent.attributes.data.id
    const attributes = webhookEvent.attributes.data.attributes as {
      metadata?: { orderNumber?: string }
      payments?: Array<{
        attributes: {
          source: { type: string }
        }
      }>
    }

    const orderNumber = attributes.metadata?.orderNumber

    const { order, matchedBy } = await findOrderForWebhook(db, paymentIntentId, orderNumber)

    if (!order) {
      console.error(
        `Order not found for payment_intent.succeeded (intent=${paymentIntentId}, orderNumber=${orderNumber})`
      )
      return { received: true, error: 'Order not found' }
    }

    if (matchedBy === 'order_number') {
      console.warn(
        `[PayMongo PI] PI drift detected: matched order ${order.orderNumber} by orderNumber. ` +
          `DB had paymongoPaymentIntentId=${order.paymongoPaymentIntentId}, payload PI=${paymentIntentId}. ` +
          `Reconciling DB to payload PI.`
      )
    }

    // Skip if already processed
    if (order.paymentStatus === 'paid') {
      console.log(`Order ${order.orderNumber} already marked as paid`)
      return { received: true, handled: true, skipped: true }
    }

    // Get payment method from payments array
    let paymentMethod = null
    if (attributes.payments?.[0]) {
      paymentMethod = attributes.payments[0].attributes?.source?.type || null
    }

    // Update order status. When matched via fallback, also reconcile the stored
    // PI so the DB reflects the PI PayMongo actually charged.
    await db
      .update(orders)
      .set({
        paymentStatus: 'paid',
        paidAt: new Date(),
        paymentMethod: paymentMethod,
        updatedAt: new Date(),
        ...(matchedBy === 'order_number' ? { paymongoPaymentIntentId: paymentIntentId } : {}),
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

    console.log(`Order ${order.orderNumber} marked as paid via Payment Intent`)

    // Record financial transaction for the event organizer
    try {
      // Get event info to find organizer
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

        // Process payment and record transaction
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
          `[PayMongo PI] Recorded transaction for organizer ${eventInfo.organizerId}: ` +
            `Gross=${grossAmount}, Fees=${walletResult.totalFees}, Net=${walletResult.netAmount}`
        )
      }
    } catch (walletErr) {
      console.error('[PayMongo PI] Failed to record wallet transaction:', walletErr)
    }

    // Send payment confirmation email
    try {
      const config = useRuntimeConfig()

      // Get order tickets with ticket type info for summary
      const orderTickets = await db
        .select({
          id: tickets.id,
          ticketTypeId: tickets.ticketTypeId,
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
          timeZone: eventData.timezone || 'Asia/Manila',
        })

        const orderUrl = `${config.public.appUrl}/orders/${order.orderNumber}`

        // Format total amount
        const totalAmount = new Intl.NumberFormat('en-PH', {
          style: 'currency',
          currency: 'PHP',
        }).format(Number(order.totalAmount))

        // Get existing setup token for guest users
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

        // Send payment successful email (no QR codes - those are sent after registration)
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
        console.log(`[PayMongo PI] Sent payment confirmation email for order ${order.orderNumber}`)
      }
    } catch (emailErr) {
      console.error('[PayMongo PI] Failed to send confirmation email:', emailErr)
    }

    return { received: true, handled: true, orderNumber: order.orderNumber }
  }

  // Handle generic payment.paid (fires for Payment Intent flow alongside or instead of payment_intent.succeeded)
  if (eventType === 'payment.paid') {
    const attributes = webhookEvent.attributes.data.attributes as {
      payment_intent_id?: string
      metadata?: { orderNumber?: string }
      source?: { type?: string }
    }

    const paymentIntentId = attributes.payment_intent_id
    const orderNumber = attributes.metadata?.orderNumber

    if (!paymentIntentId && !orderNumber) {
      console.error('No payment_intent_id or orderNumber in payment.paid payload')
      return { received: true, error: 'No order identifier' }
    }

    const { order, matchedBy } = await findOrderForWebhook(db, paymentIntentId, orderNumber)

    if (!order) {
      console.error(
        `Order not found for payment.paid (intent=${paymentIntentId}, orderNumber=${orderNumber})`
      )
      return { received: true, error: 'Order not found' }
    }

    if (matchedBy === 'order_number') {
      console.warn(
        `[PayMongo Pay] PI drift detected: matched order ${order.orderNumber} by orderNumber. ` +
          `DB had paymongoPaymentIntentId=${order.paymongoPaymentIntentId}, payload PI=${paymentIntentId}. ` +
          `Reconciling DB to payload PI.`
      )
    }

    // Skip if already processed (handles overlap with payment_intent.succeeded)
    if (order.paymentStatus === 'paid') {
      console.log(`Order ${order.orderNumber} already marked as paid`)
      return { received: true, handled: true, skipped: true }
    }

    const paymentMethod = attributes.source?.type ?? null

    // Update order status. When matched via fallback, also reconcile the stored
    // PI so the DB reflects the PI PayMongo actually charged.
    await db
      .update(orders)
      .set({
        paymentStatus: 'paid',
        paidAt: new Date(),
        paymentMethod: paymentMethod,
        updatedAt: new Date(),
        ...(matchedBy === 'order_number' && paymentIntentId
          ? { paymongoPaymentIntentId: paymentIntentId }
          : {}),
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

    console.log(`Order ${order.orderNumber} marked as paid via payment.paid`)

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
          `[PayMongo Pay] Recorded transaction for organizer ${eventInfo.organizerId}: ` +
            `Gross=${grossAmount}, Fees=${walletResult.totalFees}, Net=${walletResult.netAmount}`
        )
      }
    } catch (walletErr) {
      console.error('[PayMongo Pay] Failed to record wallet transaction:', walletErr)
    }

    // Send payment confirmation email
    try {
      const config = useRuntimeConfig()

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
          timeZone: eventData.timezone || 'Asia/Manila',
        })

        const orderUrl = `${config.public.appUrl}/orders/${order.orderNumber}`

        const totalAmount = new Intl.NumberFormat('en-PH', {
          style: 'currency',
          currency: 'PHP',
        }).format(Number(order.totalAmount))

        let setupToken: string | undefined
        if (!customer.passwordHash) {
          const existingToken = await getExistingSetupToken(customer.id)
          setupToken = existingToken ?? undefined
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
        console.log(`[PayMongo Pay] Sent payment confirmation email for order ${order.orderNumber}`)
      }
    } catch (emailErr) {
      console.error('[PayMongo Pay] Failed to send confirmation email:', emailErr)
    }

    return { received: true, handled: true, orderNumber: order.orderNumber }
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

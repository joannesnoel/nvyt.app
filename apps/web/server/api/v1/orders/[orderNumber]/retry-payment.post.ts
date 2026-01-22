import { orders, events, tickets, ticketTypes } from '@nvyt/db'
import { eq } from 'drizzle-orm'
import { createCheckoutSession, toCentavos, getPaymentIntent } from '~/server/utils/paymongo'
import { getPayPalOrder } from '~/server/utils/paypal'

export default defineEventHandler(async (event) => {
  const orderNumber = getRouterParam(event, 'orderNumber')
  const setupToken = getQuery(event).token as string | undefined

  if (!orderNumber) {
    throw createError({
      statusCode: 400,
      message: 'Order number is required',
    })
  }

  const db = useDatabase()
  const config = useRuntimeConfig()

  // Try to get authenticated user or verify setup token
  let userId: string | null = null
  const user = await getUserFromEvent(event)

  if (user) {
    userId = user.id
  } else if (setupToken) {
    const tokenStatus = await verifyAccountSetupToken(setupToken)
    if (tokenStatus.valid) {
      userId = tokenStatus.userId
    }
  }

  if (!userId) {
    throw createError({
      statusCode: 401,
      message: 'Authentication required',
    })
  }

  // Get order with event info
  const [result] = await db
    .select({
      order: orders,
      event: {
        id: events.id,
        title: events.title,
        slug: events.slug,
      },
    })
    .from(orders)
    .innerJoin(events, eq(orders.eventId, events.id))
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1)

  if (!result) {
    throw createError({
      statusCode: 404,
      message: 'Order not found',
    })
  }

  // Verify the user owns this order
  if (result.order.userId !== userId) {
    throw createError({
      statusCode: 403,
      message: 'You are not authorized to retry payment for this order',
    })
  }

  // Check payment status - only allow retry for pending or failed orders
  if (result.order.paymentStatus === 'paid') {
    throw createError({
      statusCode: 400,
      message: 'This order has already been paid',
    })
  }

  if (result.order.paymentStatus === 'refunded') {
    throw createError({
      statusCode: 400,
      message: 'This order has been refunded and cannot be retried',
    })
  }

  // Check PayPal order status if this is a PayPal order
  if (result.order.paymentProvider === 'paypal' && result.order.paypalOrderId) {
    try {
      const paypalOrder = await getPayPalOrder(result.order.paypalOrderId)

      if (paypalOrder.status === 'COMPLETED') {
        // Payment actually succeeded - update our database and inform user
        await db
          .update(orders)
          .set({
            paymentStatus: 'paid',
            paidAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(orders.id, result.order.id))

        await db
          .update(tickets)
          .set({
            status: 'confirmed',
            updatedAt: new Date(),
          })
          .where(eq(tickets.orderId, result.order.id))

        return successResponse({
          alreadyPaid: true,
          message: 'Good news! Your payment has been confirmed.',
        })
      }
    } catch (e: any) {
      // PayPal API error - proceed with retry
      console.log('[Retry Payment] Could not check PayPal order status, proceeding with retry:', e.message)
    }

    // For PayPal, return order info for frontend to show PayPal buttons
    return successResponse({
      paymentProvider: 'paypal',
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      message: 'Complete payment with PayPal',
    })
  }

  // Check PayMongo payment status if we have a payment intent
  // This prevents retry if payment is actually processing or already succeeded
  if (result.order.paymongoPaymentIntentId) {
    try {
      const paymentIntent = await getPaymentIntent(result.order.paymongoPaymentIntentId)
      const piStatus = paymentIntent.attributes.status

      if (piStatus === 'succeeded') {
        // Payment actually succeeded - update our database and inform user
        await db
          .update(orders)
          .set({
            paymentStatus: 'paid',
            paidAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(orders.id, result.order.id))

        await db
          .update(tickets)
          .set({
            status: 'confirmed',
            updatedAt: new Date(),
          })
          .where(eq(tickets.orderId, result.order.id))

        return successResponse({
          alreadyPaid: true,
          message: 'Good news! Your payment has been confirmed.',
        })
      }

      if (piStatus === 'processing') {
        // Only block if payment is actively being processed by the payment provider
        throw createError({
          statusCode: 400,
          message: 'Your payment is still being processed. Please wait a few minutes and refresh the page.',
        })
      }

      // For 'awaiting_next_action' (e.g., user selected GCash but didn't complete OTP),
      // allow retry since they can't complete the old session after closing the browser
    } catch (e: any) {
      // If it's our own error, re-throw it
      if (e.statusCode) throw e
      // Otherwise, PayMongo API error - proceed with retry (session may have expired)
      console.log('[Retry Payment] Could not check payment intent status, proceeding with retry:', e.message)
    }
  }

  // Check if this is a free order (shouldn't happen, but be safe)
  if (parseFloat(result.order.totalAmount) === 0) {
    throw createError({
      statusCode: 400,
      message: 'This is a free order and does not require payment',
    })
  }

  // Get order tickets with ticket type info to rebuild line items
  const orderTickets = await db
    .select({
      ticket: tickets,
      ticketType: {
        id: ticketTypes.id,
        name: ticketTypes.name,
        description: ticketTypes.description,
        price: ticketTypes.price,
      },
    })
    .from(tickets)
    .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
    .where(eq(tickets.orderId, result.order.id))

  if (orderTickets.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'No tickets found for this order',
    })
  }

  // Group tickets by ticket type to build line items
  const ticketTypeGroups = new Map<string, { ticketType: typeof orderTickets[0]['ticketType']; quantity: number }>()
  for (const { ticketType } of orderTickets) {
    const existing = ticketTypeGroups.get(ticketType.id)
    if (existing) {
      existing.quantity++
    } else {
      ticketTypeGroups.set(ticketType.id, { ticketType, quantity: 1 })
    }
  }

  // Build line items for PayMongo
  const lineItems = Array.from(ticketTypeGroups.values()).map(({ ticketType, quantity }) => ({
    name: `${result.event.title} - ${ticketType.name}`,
    quantity,
    amount: toCentavos(parseFloat(ticketType.price)),
    currency: 'PHP',
    description: ticketType.description || undefined,
  }))

  // Generate new setup token if user needs account setup
  let setupTokenForUrl: string | null = null
  const userRecord = await getUserFromEvent(event)
  if (!userRecord) {
    // User accessed via setup token - they need account setup
    setupTokenForUrl = setupToken || null
  }

  // Create new PayMongo checkout session
  const appUrl = config.public.appUrl as string
  const successUrl = setupTokenForUrl
    ? `${appUrl}/orders/${orderNumber}/success?token=${setupTokenForUrl}`
    : `${appUrl}/orders/${orderNumber}/success`

  // Generate unique reference number for retry to avoid PayMongo caching issues
  const retryTimestamp = Date.now().toString(36).toUpperCase()
  const retryReferenceNumber = `${orderNumber}-R${retryTimestamp}`

  const checkoutSession = await createCheckoutSession({
    lineItems,
    successUrl,
    cancelUrl: `${appUrl}/events/${result.event.slug}?checkout=cancelled`,
    referenceNumber: retryReferenceNumber,
    customerEmail: result.order.customerEmail,
    customerName: result.order.customerName,
    customerPhone: result.order.customerPhone || undefined,
    metadata: {
      eventId: result.order.eventId,
      userId: result.order.userId,
      orderNumber, // Keep original order number in metadata for webhook
      isRetry: 'true',
    },
  })

  // Update order with new PayMongo session IDs
  await db
    .update(orders)
    .set({
      paymongoCheckoutSessionId: checkoutSession.id,
      paymongoPaymentIntentId: checkoutSession.attributes.payment_intent?.id,
      paymentStatus: 'pending',
      updatedAt: new Date(),
    })
    .where(eq(orders.id, result.order.id))

  // If order was failed, reset tickets to pending status
  if (result.order.paymentStatus === 'failed') {
    await db
      .update(tickets)
      .set({
        status: 'pending',
        updatedAt: new Date(),
      })
      .where(eq(tickets.orderId, result.order.id))
  }

  return successResponse({
    checkoutUrl: checkoutSession.attributes.checkout_url,
    message: 'Redirecting to payment...',
  })
})

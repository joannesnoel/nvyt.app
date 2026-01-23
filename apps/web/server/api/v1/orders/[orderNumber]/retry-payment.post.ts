import { orders, events, tickets } from '@nvyt/db'
import { eq } from 'drizzle-orm'
import { createPaymentIntent, toCentavos, getPaymentIntent } from '~/server/utils/paymongo'
import { getPayPalOrder, createPayPalOrder, toCents } from '~/server/utils/paypal'

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

  // Determine if user needs setup token for success URL
  const userRecord = await getUserFromEvent(event)
  const setupTokenForUrl = !userRecord ? (setupToken || null) : null
  const appUrl = config.public.appUrl as string

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

    // For PayPal, create a new PayPal order and redirect
    const subtotal = parseFloat(result.order.subtotalAmount)
    const processingFee = parseFloat(result.order.processingFee || '0')
    const adminFee = parseFloat(result.order.adminFee || '0')

    const lineItems = [
      {
        name: `Tickets for ${result.event.title}`,
        quantity: 1,
        amount: toCents(subtotal),
        currency: result.order.currency,
        description: `Order ${result.order.orderNumber}`,
      },
    ]

    if (processingFee > 0) {
      lineItems.push({
        name: 'Processing Fee',
        quantity: 1,
        amount: toCents(processingFee),
        currency: result.order.currency,
        description: 'Payment processing fee',
      })
    }

    if (adminFee > 0) {
      lineItems.push({
        name: 'Service Fee',
        quantity: 1,
        amount: toCents(adminFee),
        currency: result.order.currency,
        description: 'Booking service fee',
      })
    }

    // Build return URL with retry params - goes to PayPal return page
    const returnParams = new URLSearchParams({
      retry: orderNumber,
    })
    if (setupTokenForUrl) {
      returnParams.set('setupToken', setupTokenForUrl)
    }
    const returnUrl = `${appUrl}/checkout/paypal/return?${returnParams.toString()}`

    const paypalOrder = await createPayPalOrder({
      lineItems,
      currency: result.order.currency,
      referenceId: `${orderNumber}-R${Date.now().toString(36).toUpperCase()}`,
      description: `Tickets for ${result.event.title}`,
      returnUrl,
      cancelUrl: `${appUrl}/events/${result.event.slug}?checkout=cancelled`,
    })

    // Update order with new PayPal order ID
    await db
      .update(orders)
      .set({
        paypalOrderId: paypalOrder.id,
        paymentStatus: 'pending',
        updatedAt: new Date(),
      })
      .where(eq(orders.id, result.order.id))

    // Get approval URL
    const approvalLink = paypalOrder.links.find(link => link.rel === 'payer-action')
    if (!approvalLink) {
      throw createError({
        statusCode: 500,
        message: 'Failed to get PayPal approval URL',
      })
    }

    return successResponse({
      paymentProvider: 'paypal',
      approvalUrl: approvalLink.href,
      message: 'Redirecting to PayPal...',
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

  // Get the total amount from the order
  const totalAmount = parseFloat(result.order.totalAmount)

  // Create new PayMongo Payment Intent (single amount, no line items)
  const paymentIntent = await createPaymentIntent({
    amount: toCentavos(totalAmount),
    currency: 'PHP',
    description: `Tickets for ${result.event.title}`,
    metadata: {
      eventId: result.order.eventId,
      userId: result.order.userId,
      orderNumber, // Keep original order number for webhook
      isRetry: 'true',
    },
  })

  // Update order with new PayMongo Payment Intent ID
  await db
    .update(orders)
    .set({
      paymongoPaymentIntentId: paymentIntent.id,
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

  // Build checkout page URL
  const checkoutUrl = setupTokenForUrl
    ? `${appUrl}/checkout/${orderNumber}?token=${setupTokenForUrl}`
    : `${appUrl}/checkout/${orderNumber}`

  return successResponse({
    checkoutUrl,
    message: 'Redirecting to checkout...',
  })
})

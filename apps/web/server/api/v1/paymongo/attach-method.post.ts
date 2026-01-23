import { orders, events } from '@nvyt/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  createPaymentMethod,
  attachPaymentMethod,
  getPaymentIntent,
  type PaymentMethodType,
} from '~/server/utils/paymongo'

const attachMethodSchema = z.object({
  orderNumber: z.string().min(1),
  paymentMethodId: z.string().optional(), // For card payments created client-side
  paymentMethodType: z.enum(['card', 'gcash', 'paymaya', 'grab_pay', 'qrph']),
  billing: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }).optional(),
})

/**
 * Attach a payment method to a Payment Intent
 * For e-wallets (GCash, Maya, Grab Pay), creates the payment method server-side
 * For cards, uses the payment method ID created client-side via PayMongo.js
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // Validate input
  const result = attachMethodSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const data = result.data
  const db = useDatabase()
  const config = useRuntimeConfig()

  // Get user (support both authenticated and guest with token)
  let userId: string | null = null
  const user = await getUserFromEvent(event)

  if (user) {
    userId = user.id
  } else {
    // Check for setup token in query
    const setupToken = getQuery(event).token as string | undefined
    if (setupToken) {
      const tokenStatus = await verifyAccountSetupToken(setupToken)
      if (tokenStatus.valid) {
        userId = tokenStatus.userId
      }
    }
  }

  if (!userId) {
    throw createError({
      statusCode: 401,
      message: 'Authentication required',
    })
  }

  // Get order
  const [orderResult] = await db
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
    .where(eq(orders.orderNumber, data.orderNumber))
    .limit(1)

  if (!orderResult) {
    throw createError({
      statusCode: 404,
      message: 'Order not found',
    })
  }

  // Verify user owns this order
  if (orderResult.order.userId !== userId) {
    throw createError({
      statusCode: 403,
      message: 'Not authorized to access this order',
    })
  }

  // Check order status
  if (orderResult.order.paymentStatus === 'paid') {
    throw createError({
      statusCode: 400,
      message: 'This order has already been paid',
    })
  }

  // Ensure we have a payment intent
  if (!orderResult.order.paymongoPaymentIntentId) {
    throw createError({
      statusCode: 400,
      message: 'No payment intent found for this order',
    })
  }

  // Check payment intent status
  const paymentIntent = await getPaymentIntent(orderResult.order.paymongoPaymentIntentId)

  if (paymentIntent.attributes.status === 'succeeded') {
    // Already paid - update our database
    await db
      .update(orders)
      .set({
        paymentStatus: 'paid',
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderResult.order.id))

    return successResponse({
      status: 'succeeded',
      message: 'Payment already completed',
    })
  }

  if (paymentIntent.attributes.status === 'processing') {
    throw createError({
      statusCode: 400,
      message: 'Payment is already processing. Please wait.',
    })
  }

  // Determine payment method ID
  let paymentMethodId: string

  if (data.paymentMethodType === 'card') {
    // For cards, the payment method should be created client-side via PayMongo.js
    if (!data.paymentMethodId) {
      throw createError({
        statusCode: 400,
        message: 'Payment method ID is required for card payments',
      })
    }
    paymentMethodId = data.paymentMethodId
  } else {
    // For e-wallets, create the payment method server-side
    const paymentMethod = await createPaymentMethod({
      type: data.paymentMethodType as PaymentMethodType,
      billing: data.billing ? {
        name: data.billing.name,
        email: data.billing.email,
        phone: data.billing.phone,
      } : undefined,
    })
    paymentMethodId = paymentMethod.id
  }

  // Build return URL
  const appUrl = config.public.appUrl as string
  const returnParams = new URLSearchParams({
    order: data.orderNumber,
  })
  const returnUrl = `${appUrl}/checkout/paymongo/return?${returnParams.toString()}`

  // Attach payment method to payment intent
  const attachResult = await attachPaymentMethod({
    paymentIntentId: orderResult.order.paymongoPaymentIntentId,
    paymentMethodId,
    returnUrl,
  })

  // Update order with payment method type
  await db
    .update(orders)
    .set({
      paymentMethod: data.paymentMethodType,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderResult.order.id))

  // Check the result status
  const status = attachResult.attributes.status

  if (status === 'succeeded') {
    // Payment completed immediately (rare, but possible for some cards)
    return successResponse({
      status: 'succeeded',
      message: 'Payment completed successfully',
    })
  }

  if (status === 'awaiting_next_action' && attachResult.attributes.next_action?.redirect) {
    // Needs redirect (3DS for cards, or e-wallet authorization)
    return successResponse({
      status: 'awaiting_next_action',
      nextAction: {
        type: 'redirect',
        redirectUrl: attachResult.attributes.next_action.redirect.url,
      },
    })
  }

  if (status === 'processing') {
    // Payment is being processed (QR Ph, some bank transfers)
    return successResponse({
      status: 'processing',
      message: 'Payment is being processed. You will be notified when complete.',
    })
  }

  if (status === 'failed') {
    throw createError({
      statusCode: 400,
      message: 'Payment failed. Please try again with a different payment method.',
    })
  }

  // Awaiting payment method (shouldn't happen after attach, but handle it)
  return successResponse({
    status: status,
    message: 'Payment method attached. Awaiting confirmation.',
  })
})

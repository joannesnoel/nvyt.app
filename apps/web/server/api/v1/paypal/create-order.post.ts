import { orders, events } from '@nvyt/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { createPayPalOrder, toCents } from '~/server/utils/paypal'

const createPayPalOrderSchema = z.object({
  orderId: z.string().uuid(),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // Validate input
  const result = createPayPalOrderSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const { orderId } = result.data
  const db = useDatabase()
  const config = useRuntimeConfig()

  // Get the order
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)

  if (!order) {
    throw createError({
      statusCode: 404,
      message: 'Order not found',
    })
  }

  // Check if order is still pending
  if (order.paymentStatus !== 'pending') {
    throw createError({
      statusCode: 400,
      message: 'Order is not pending payment',
    })
  }

  // Check if order already has a PayPal order
  if (order.paypalOrderId) {
    // Return existing PayPal order ID
    return successResponse({
      paypalOrderId: order.paypalOrderId,
      message: 'Using existing PayPal order',
    })
  }

  // Get event details for line items
  const [eventRecord] = await db
    .select()
    .from(events)
    .where(eq(events.id, order.eventId))
    .limit(1)

  if (!eventRecord) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  // Create line items for PayPal
  const subtotalAmount = parseFloat(order.subtotalAmount)
  const totalFees = parseFloat(order.totalFees)
  const totalAmount = parseFloat(order.totalAmount)

  const lineItems = [
    {
      name: `Tickets for ${eventRecord.title}`,
      quantity: 1,
      amount: toCents(subtotalAmount),
      currency: order.currency,
      description: `Order ${order.orderNumber}`,
    },
  ]

  // Add fees as a separate line item if present
  if (totalFees > 0) {
    lineItems.push({
      name: 'Fees',
      quantity: 1,
      amount: toCents(totalFees),
      currency: order.currency,
      description: 'Transaction and booking fees',
    })
  }

  const appUrl = config.public.appUrl as string

  // Create PayPal order
  const paypalOrder = await createPayPalOrder({
    lineItems,
    currency: order.currency,
    referenceId: order.orderNumber,
    description: `Tickets for ${eventRecord.title}`,
    returnUrl: `${appUrl}/orders/${order.orderNumber}/success`,
    cancelUrl: `${appUrl}/events/${eventRecord.slug}?checkout=cancelled`,
  })

  // Update order with PayPal order ID
  await db
    .update(orders)
    .set({
      paypalOrderId: paypalOrder.id,
      paymentProvider: 'paypal',
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId))

  return successResponse({
    paypalOrderId: paypalOrder.id,
    message: 'PayPal order created',
  })
})

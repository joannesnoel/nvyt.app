import { orders, events, tickets, ticketTypes, discountCodes } from '@nvyt/db'
import { eq, and, ne, sql } from 'drizzle-orm'
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

  // Cancel any other pending orders from this user for this event
  // This handles the case where a user started with a different payment provider and switched to PayPal
  const existingPendingOrders = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber, discountCodeId: orders.discountCodeId })
    .from(orders)
    .where(
      and(
        eq(orders.userId, order.userId),
        eq(orders.eventId, order.eventId),
        eq(orders.paymentStatus, 'pending'),
        ne(orders.id, order.id)
      )
    )

  for (const pendingOrder of existingPendingOrders) {
    const pendingTickets = await db
      .select({ ticketTypeId: tickets.ticketTypeId })
      .from(tickets)
      .where(eq(tickets.orderId, pendingOrder.id))

    const ticketTypeCountMap = new Map<string, number>()
    for (const t of pendingTickets) {
      ticketTypeCountMap.set(t.ticketTypeId, (ticketTypeCountMap.get(t.ticketTypeId) || 0) + 1)
    }
    for (const [ttId, count] of ticketTypeCountMap) {
      await db
        .update(ticketTypes)
        .set({
          quantitySold: sql`GREATEST(${ticketTypes.quantitySold} - ${count}, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(ticketTypes.id, ttId))
    }

    await db
      .update(tickets)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(tickets.orderId, pendingOrder.id))

    await db
      .update(orders)
      .set({ paymentStatus: 'failed', updatedAt: new Date() })
      .where(eq(orders.id, pendingOrder.id))

    if (pendingOrder.discountCodeId) {
      await db
        .update(discountCodes)
        .set({
          usageCount: sql`GREATEST(${discountCodes.usageCount} - 1, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(discountCodes.id, pendingOrder.discountCodeId))
    }

    console.log(`[PayPal] Cancelled stale pending order ${pendingOrder.orderNumber} for user ${order.userId}`)
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

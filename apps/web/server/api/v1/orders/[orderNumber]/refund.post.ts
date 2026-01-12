import { eq } from 'drizzle-orm'
import { orders, tickets, events, users, ticketTypes } from '@nvyt/db'
import { createRefund, getPaymentIntent, toCentavos } from '~/server/utils/paymongo'
import { sendEmail } from '~/server/utils/email'

export default defineEventHandler(async (event) => {
  const orderNumber = getRouterParam(event, 'orderNumber')
  const body = await readBody(event)

  if (!orderNumber) {
    throw createError({
      statusCode: 400,
      message: 'Order number is required',
    })
  }

  const db = useDatabase()
  const user = await requireAuth(event)
  const config = useRuntimeConfig()

  // Fetch order
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1)

  if (!order) {
    throw createError({
      statusCode: 404,
      message: 'Order not found',
    })
  }

  // Fetch event to check organizer
  const [eventData] = await db
    .select()
    .from(events)
    .where(eq(events.id, order.eventId))
    .limit(1)

  if (!eventData) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  // Only event organizer can process refunds
  if (eventData.organizerId !== user.id) {
    throw createError({
      statusCode: 403,
      message: 'Only the event organizer can process refunds',
    })
  }

  // Check if order can be refunded
  if (order.paymentStatus !== 'paid') {
    throw createError({
      statusCode: 400,
      message: `Cannot refund order with status: ${order.paymentStatus}`,
    })
  }

  // Check if it's a free order
  if (parseFloat(order.totalAmount) === 0) {
    // For free orders, just update status without PayMongo refund
    await db
      .update(orders)
      .set({
        paymentStatus: 'refunded',
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))

    // Update ticket statuses
    await db
      .update(tickets)
      .set({
        status: 'refunded',
        updatedAt: new Date(),
      })
      .where(eq(tickets.orderId, order.id))

    return successResponse({
      message: 'Free order cancelled successfully',
      orderNumber: order.orderNumber,
    })
  }

  // For paid orders, we need the payment intent ID to create refund
  if (!order.paymongoPaymentIntentId) {
    throw createError({
      statusCode: 400,
      message: 'Cannot process refund: No payment intent found',
    })
  }

  // Get payment intent to find the payment ID
  let paymentId: string | null = null
  try {
    const paymentIntent = await getPaymentIntent(order.paymongoPaymentIntentId)
    const payment = paymentIntent.attributes.payments?.[0]
    if (payment) {
      paymentId = payment.id
    }
  } catch (err) {
    console.error('Failed to get payment intent:', err)
    throw createError({
      statusCode: 500,
      message: 'Failed to retrieve payment information',
    })
  }

  if (!paymentId) {
    throw createError({
      statusCode: 400,
      message: 'Cannot process refund: No payment found for this order',
    })
  }

  // Calculate refund amount in centavos
  const refundAmount = toCentavos(parseFloat(order.totalAmount))
  const reason = body?.reason || 'requested_by_customer'

  // Create refund via PayMongo
  try {
    const refund = await createRefund(paymentId, refundAmount, reason)

    // Update order status
    await db
      .update(orders)
      .set({
        paymentStatus: 'refunded',
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))

    // Update ticket statuses
    await db
      .update(tickets)
      .set({
        status: 'refunded',
        updatedAt: new Date(),
      })
      .where(eq(tickets.orderId, order.id))

    // Send refund notification email to customer
    try {
      const [customer] = await db
        .select()
        .from(users)
        .where(eq(users.id, order.userId))
        .limit(1)

      if (customer) {
        const formattedAmount = new Intl.NumberFormat('en-PH', {
          style: 'currency',
          currency: 'PHP',
        }).format(parseFloat(order.totalAmount))

        await sendEmail({
          to: customer.email,
          subject: `Refund processed for ${eventData.title} - Order ${order.orderNumber}`,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #6366f1; margin: 0;">nvyt</h1>
              </div>

              <h2 style="color: #111; margin-bottom: 10px;">Refund Processed</h2>

              <p>Hi ${customer.name || 'there'},</p>

              <p>Your refund for <strong>${eventData.title}</strong> has been processed.</p>

              <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0;"><strong>Order Number:</strong> ${order.orderNumber}</p>
                <p style="margin: 0 0 10px 0;"><strong>Refund Amount:</strong> ${formattedAmount}</p>
                <p style="margin: 0;"><strong>Status:</strong> Processing</p>
              </div>

              <p style="color: #666; font-size: 14px;">
                The refund will be credited back to your original payment method within 5-10 business days, depending on your bank or e-wallet provider.
              </p>

              ${reason && reason !== 'requested_by_customer' ? `
              <p style="color: #666; font-size: 14px;">
                <strong>Reason:</strong> ${reason}
              </p>
              ` : ''}

              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

              <p style="color: #666; font-size: 14px;">
                If you have any questions, please contact the event organizer.<br>
                The nvyt Team
              </p>
            </body>
            </html>
          `,
        })
        console.log(`[Refund] Sent refund notification for order ${order.orderNumber}`)
      }
    } catch (emailErr) {
      console.error('[Refund] Failed to send refund notification:', emailErr)
    }

    return successResponse({
      message: 'Refund processed successfully',
      orderNumber: order.orderNumber,
      refundId: refund.id,
      refundStatus: refund.attributes.status,
    })
  } catch (err: any) {
    console.error('Failed to create refund:', err)
    throw createError({
      statusCode: 500,
      message: err.message || 'Failed to process refund',
    })
  }
})

import { orders, tickets, events, users, ticketTypes, ticketRegistrationFields } from '@nvyt/db'
import { eq, and, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  getPaymentIntent,
  isPaymentSuccessful,
  getPaymentMethod,
} from '~/server/utils/paymongo'
import { processPaymentReceived } from '~/server/utils/wallet'
import { sendEmail, paymentSuccessfulEmail } from '~/server/utils/email'
import { getExistingSetupToken } from '~/server/utils/auth'

const verifyPaymentSchema = z.object({
  orderNumber: z.string().min(1),
})

/**
 * Verify payment status after redirect from 3DS/e-wallet
 * This is called from the return page to check if payment succeeded
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const result = verifyPaymentSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const { orderNumber } = result.data
  const db = useDatabase()
  const config = useRuntimeConfig()

  // Get order
  const [orderResult] = await db
    .select({
      order: orders,
      event: {
        id: events.id,
        title: events.title,
        slug: events.slug,
        startDate: events.startDate,
        location: events.location,
        organizerId: events.organizerId,
      },
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

  // If order is already paid, return success
  if (orderResult.order.paymentStatus === 'paid') {
    // Get setup token for guest users
    let setupToken: string | undefined
    const [customer] = await db
      .select()
      .from(users)
      .where(eq(users.id, orderResult.order.userId))
      .limit(1)

    if (customer && !customer.passwordHash) {
      const existingToken = await getExistingSetupToken(customer.id)
      setupToken = existingToken ?? undefined
    }

    return successResponse({
      status: 'succeeded',
      orderNumber,
      alreadyPaid: true,
      setupToken,
    })
  }

  // Ensure we have a payment intent
  if (!orderResult.order.paymongoPaymentIntentId) {
    throw createError({
      statusCode: 400,
      message: 'No payment intent found for this order',
    })
  }

  // Get payment intent status from PayMongo
  const paymentIntent = await getPaymentIntent(orderResult.order.paymongoPaymentIntentId)
  const status = paymentIntent.attributes.status

  if (status === 'succeeded') {
    // Payment successful - update order and tickets
    const paymentMethod = getPaymentMethod(paymentIntent)

    await db
      .update(orders)
      .set({
        paymentStatus: 'paid',
        paidAt: new Date(),
        paymentMethod: paymentMethod,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderResult.order.id))

    // Confirm all tickets
    await db
      .update(tickets)
      .set({
        status: 'confirmed',
        updatedAt: new Date(),
      })
      .where(eq(tickets.orderId, orderResult.order.id))

    // Record financial transaction for the event organizer
    try {
      if (orderResult.event.organizerId) {
        const grossAmount = Number(orderResult.order.totalAmount)

        const walletResult = await processPaymentReceived({
          userId: orderResult.event.organizerId,
          orderId: orderResult.order.id,
          eventId: orderResult.order.eventId,
          grossAmount,
          eventTitle: orderResult.event.title,
        })

        console.log(
          `[PayMongo Return] Recorded transaction for organizer ${orderResult.event.organizerId}: ` +
            `Gross=${grossAmount}, Fee=${walletResult.platformFee}, Net=${walletResult.netAmount}`
        )
      }
    } catch (walletErr) {
      console.error('[PayMongo Return] Failed to record wallet transaction:', walletErr)
    }

    // Send payment confirmation email
    try {
      // Get order tickets with ticket type info for summary
      const orderTickets = await db
        .select({
          id: tickets.id,
          ticketTypeId: tickets.ticketTypeId,
          ticketTypeName: ticketTypes.name,
        })
        .from(tickets)
        .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
        .where(eq(tickets.orderId, orderResult.order.id))

      // Get customer info
      const [customer] = await db
        .select()
        .from(users)
        .where(eq(users.id, orderResult.order.userId))
        .limit(1)

      // Check if event has active registration fields
      const [registrationFieldCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(ticketRegistrationFields)
        .where(
          and(
            eq(ticketRegistrationFields.eventId, orderResult.order.eventId),
            eq(ticketRegistrationFields.isActive, true)
          )
        )
      const requiresRegistration = (registrationFieldCount?.count ?? 0) > 0

      if (customer) {
        const eventDate = new Date(orderResult.event.startDate).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })

        const orderUrl = `${config.public.appUrl}/orders/${orderNumber}`

        const totalAmount = new Intl.NumberFormat('en-PH', {
          style: 'currency',
          currency: 'PHP',
        }).format(Number(orderResult.order.totalAmount))

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

        const emailContent = paymentSuccessfulEmail({
          userName: customer.name || 'there',
          eventTitle: orderResult.event.title,
          eventDate,
          eventLocation: orderResult.event.location || undefined,
          orderNumber,
          ticketCount: orderTickets.length,
          ticketSummary,
          totalAmount,
          orderUrl,
          setupToken,
          requiresRegistration,
        })

        await sendEmail({ to: customer.email, ...emailContent })
        console.log(`[PayMongo Return] Sent payment confirmation email for order ${orderNumber}`)
      }
    } catch (emailErr) {
      console.error('[PayMongo Return] Failed to send confirmation email:', emailErr)
    }

    // Get setup token for response if guest user
    let setupToken: string | undefined
    const [customer] = await db
      .select()
      .from(users)
      .where(eq(users.id, orderResult.order.userId))
      .limit(1)

    if (customer && !customer.passwordHash) {
      const existingToken = await getExistingSetupToken(customer.id)
      setupToken = existingToken ?? undefined
    }

    return successResponse({
      status: 'succeeded',
      orderNumber,
      setupToken,
    })
  }

  if (status === 'failed') {
    // Payment failed
    await db
      .update(orders)
      .set({
        paymentStatus: 'failed',
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderResult.order.id))

    await db
      .update(tickets)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(eq(tickets.orderId, orderResult.order.id))

    return successResponse({
      status: 'failed',
      orderNumber,
      message: 'Payment failed. Please try again.',
    })
  }

  if (status === 'processing') {
    // Still processing (e.g., QR Ph)
    return successResponse({
      status: 'processing',
      orderNumber,
      message: 'Payment is being processed. You will receive an email when complete.',
    })
  }

  // Still awaiting (user may have cancelled at 3DS/e-wallet page)
  return successResponse({
    status: 'pending',
    orderNumber,
    message: 'Payment was not completed. Please try again.',
  })
})

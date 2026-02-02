import { orders, tickets, events, users, ticketTypes, ticketRegistrationFields } from '@nvyt/db'
import { eq, and, isNotNull, sql } from 'drizzle-orm'
import {
  getPaymentIntent,
  getPaymentMethod,
} from '~/server/utils/paymongo'
import { processPaymentReceived } from '~/server/utils/wallet'
import { sendEmail, paymentSuccessfulEmail } from '~/server/utils/email'
import { getExistingSetupToken } from '~/server/utils/auth'

/**
 * Reconcile pending orders against PayMongo payment intent status.
 * Used to recover orders where the webhook was blocked by WAF.
 *
 * POST /api/v1/admin/reconcile-payments
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  requireAdmin(user.email)

  const db = useDatabase()
  const config = useRuntimeConfig()

  // Get all pending orders that have a PayMongo payment intent
  const pendingOrders = await db
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
    .where(
      and(
        eq(orders.paymentStatus, 'pending'),
        isNotNull(orders.paymongoPaymentIntentId)
      )
    )

  const summary = { paid: 0, failed: 0, skipped: 0 }
  const errors: Array<{ orderNumber: string; error: string }> = []
  const details: Array<{ orderNumber: string; status: string; amount?: number }> = []

  for (const { order, event: evt } of pendingOrders) {
    try {
      // Small delay to avoid hitting PayMongo rate limits
      await new Promise((resolve) => setTimeout(resolve, 200))

      const paymentIntent = await getPaymentIntent(order.paymongoPaymentIntentId!)
      const status = paymentIntent.attributes.status

      if (status === 'succeeded') {
        // --- Payment successful: mirror verify-payment.post.ts logic ---
        const paymentMethod = getPaymentMethod(paymentIntent)

        await db
          .update(orders)
          .set({
            paymentStatus: 'paid',
            paidAt: new Date(),
            paymentMethod,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id))

        await db
          .update(tickets)
          .set({ status: 'confirmed', updatedAt: new Date() })
          .where(eq(tickets.orderId, order.id))

        // Record wallet transaction
        try {
          if (evt.organizerId) {
            const grossAmount = Number(order.totalAmount)
            await processPaymentReceived({
              userId: evt.organizerId,
              orderId: order.id,
              eventId: order.eventId,
              grossAmount,
              totalFees: Number(order.totalFees),
              netAmount: Number(order.subtotalAmount),
              eventTitle: evt.title,
            })
          }
        } catch (walletErr) {
          console.error(`[Reconcile] Wallet error for ${order.orderNumber}:`, walletErr)
        }

        // Send confirmation email
        try {
          const orderTickets = await db
            .select({
              id: tickets.id,
              ticketTypeId: tickets.ticketTypeId,
              ticketTypeName: ticketTypes.name,
            })
            .from(tickets)
            .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
            .where(eq(tickets.orderId, order.id))

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

          if (customer) {
            const eventDate = new Date(evt.startDate).toLocaleDateString('en-US', {
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
              currency: 'PHP',
            }).format(Number(order.totalAmount))

            let setupToken: string | undefined
            if (!customer.passwordHash) {
              const existing = await getExistingSetupToken(customer.id)
              setupToken = existing ?? undefined
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
              eventTitle: evt.title,
              eventDate,
              eventLocation: evt.location || undefined,
              orderNumber: order.orderNumber,
              ticketCount: orderTickets.length,
              ticketSummary,
              totalAmount,
              orderUrl,
              setupToken,
              requiresRegistration,
            })

            await sendEmail({ to: customer.email, ...emailContent })
          }
        } catch (emailErr) {
          console.error(`[Reconcile] Email error for ${order.orderNumber}:`, emailErr)
        }

        summary.paid++
        details.push({ orderNumber: order.orderNumber, status: 'paid', amount: Number(order.totalAmount) })
        console.log(`[Reconcile] Paid: ${order.orderNumber}`)

      } else if (status === 'failed') {
        // --- Payment failed ---
        await db
          .update(orders)
          .set({ paymentStatus: 'failed', updatedAt: new Date() })
          .where(eq(orders.id, order.id))

        await db
          .update(tickets)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(eq(tickets.orderId, order.id))

        summary.failed++
        details.push({ orderNumber: order.orderNumber, status: 'failed' })
        console.log(`[Reconcile] Failed: ${order.orderNumber}`)

      } else {
        // awaiting_payment_method, awaiting_next_action, processing — skip
        summary.skipped++
        details.push({ orderNumber: order.orderNumber, status: 'skipped' })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      errors.push({ orderNumber: order.orderNumber, error: message })
      console.error(`[Reconcile] Error for ${order.orderNumber}:`, err)
    }
  }

  console.log(
    `[Reconcile] Done — Total: ${pendingOrders.length}, Paid: ${summary.paid}, Failed: ${summary.failed}, Skipped: ${summary.skipped}, Errors: ${errors.length}`
  )

  return successResponse({
    total: pendingOrders.length,
    reconciled: summary,
    errors,
    details,
  })
})

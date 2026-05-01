import { eq, and, sql } from 'drizzle-orm'
import {
  orders,
  tickets,
  events,
  users,
  ticketTypes,
  ticketRegistrationFields,
} from '@nvyt/db'
import { processPaymentReceived } from '~/server/utils/wallet'
import { sendEmail, paymentSuccessfulEmail } from '~/server/utils/email'
import { getExistingSetupToken } from '~/server/utils/auth'

interface MarkOrderPaidOptions {
  orderId: string
  paymentMethod?: string | null
}

interface MarkOrderPaidResult {
  alreadyPaid: boolean
  walletRecorded: boolean
  emailSent: boolean
  warnings: string[]
}

/**
 * Promote an order from non-paid to paid and run the full success path:
 *  - update order to paid
 *  - confirm tickets
 *  - record organizer wallet transaction
 *  - send payment confirmation email to the buyer
 *
 * Mirrors the success branch of verify-payment.post.ts and reconcile-payments.post.ts,
 * but is invoked manually from the admin troubleshoot tool. Wallet recording is
 * idempotent (processPaymentReceived dedupes per orderId).
 */
export async function markOrderPaid(
  options: MarkOrderPaidOptions
): Promise<MarkOrderPaidResult> {
  const { orderId, paymentMethod } = options
  const db = useDatabase()
  const config = useRuntimeConfig()
  const warnings: string[] = []

  const [row] = await db
    .select({
      order: orders,
      event: {
        id: events.id,
        title: events.title,
        slug: events.slug,
        startDate: events.startDate,
        location: events.location,
        organizerId: events.organizerId,
        timezone: events.timezone,
      },
    })
    .from(orders)
    .innerJoin(events, eq(orders.eventId, events.id))
    .where(eq(orders.id, orderId))
    .limit(1)

  if (!row) {
    throw createError({ statusCode: 404, message: 'Order not found' })
  }

  if (row.order.paymentStatus === 'paid') {
    return { alreadyPaid: true, walletRecorded: false, emailSent: false, warnings }
  }

  await db
    .update(orders)
    .set({
      paymentStatus: 'paid',
      paidAt: new Date(),
      ...(paymentMethod ? { paymentMethod } : {}),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, row.order.id))

  await db
    .update(tickets)
    .set({ status: 'confirmed', updatedAt: new Date() })
    .where(eq(tickets.orderId, row.order.id))

  let walletRecorded = false
  try {
    if (row.event.organizerId) {
      const grossAmount = Number(row.order.totalAmount)
      await processPaymentReceived({
        userId: row.event.organizerId,
        orderId: row.order.id,
        eventId: row.order.eventId,
        grossAmount,
        totalFees: Number(row.order.totalFees),
        netAmount: Number(row.order.subtotalAmount) - Number(row.order.discountAmount),
        eventTitle: row.event.title,
      })
      walletRecorded = true
    }
  } catch (walletErr) {
    const msg = walletErr instanceof Error ? walletErr.message : 'wallet error'
    console.error(`[markOrderPaid] Wallet error for ${row.order.orderNumber}:`, walletErr)
    warnings.push(`wallet: ${msg}`)
  }

  let emailSent = false
  try {
    const orderTickets = await db
      .select({
        id: tickets.id,
        ticketTypeId: tickets.ticketTypeId,
        ticketTypeName: ticketTypes.name,
      })
      .from(tickets)
      .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
      .where(eq(tickets.orderId, row.order.id))

    const [customer] = await db
      .select()
      .from(users)
      .where(eq(users.id, row.order.userId))
      .limit(1)

    const [registrationFieldCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ticketRegistrationFields)
      .where(
        and(
          eq(ticketRegistrationFields.eventId, row.order.eventId),
          eq(ticketRegistrationFields.isActive, true)
        )
      )
    const requiresRegistration = (registrationFieldCount?.count ?? 0) > 0

    if (customer) {
      const eventDate = new Date(row.event.startDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: row.event.timezone || 'Asia/Manila',
      })

      const orderUrl = `${config.public.appUrl}/orders/${row.order.orderNumber}`
      const totalAmount = new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
      }).format(Number(row.order.totalAmount))

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
          ticketSummaryMap.set(t.ticketTypeId, {
            ticketType: t.ticketTypeName,
            quantity: 1,
          })
        }
      }
      const ticketSummary = Array.from(ticketSummaryMap.values())

      const emailContent = paymentSuccessfulEmail({
        userName: customer.name || 'there',
        eventTitle: row.event.title,
        eventDate,
        eventLocation: row.event.location || undefined,
        orderNumber: row.order.orderNumber,
        ticketCount: orderTickets.length,
        ticketSummary,
        totalAmount,
        orderUrl,
        setupToken,
        requiresRegistration,
      })

      await sendEmail({ to: customer.email, ...emailContent })
      emailSent = true
    }
  } catch (emailErr) {
    const msg = emailErr instanceof Error ? emailErr.message : 'email error'
    console.error(`[markOrderPaid] Email error for ${row.order.orderNumber}:`, emailErr)
    warnings.push(`email: ${msg}`)
  }

  return { alreadyPaid: false, walletRecorded, emailSent, warnings }
}

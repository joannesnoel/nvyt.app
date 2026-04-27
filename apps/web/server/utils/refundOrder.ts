import { eq, and, sql } from 'drizzle-orm'
import {
  orders,
  tickets,
  ticketTypes,
  ticketPriceTiers,
  discountCodes,
  wallets,
  transactions,
  events,
  users,
  type Order,
} from '@nvyt/db'
import { sendEmail } from './email'

export interface RefundParams {
  /** Order to refund (must already be paymentStatus='paid'). */
  order: Order
  /** Amount actually returned to the buyer (PHP). May be < totalAmount when keeping fees. */
  refundedAmount: number
  /** Admin user id issuing the refund. */
  refundedBy: string
  /** Optional reason recorded on the order and shown in email. */
  reason?: string
  /** Provider refund id (set whichever applies). */
  paymongoRefundId?: string | null
  paypalRefundId?: string | null
}

/**
 * Mark a paid order as refunded inside a single transaction:
 *  - Set order.paymentStatus='refunded' + refund metadata
 *  - Set all tickets in the order to status='refunded'
 *  - Decrement ticketTypes.quantitySold and ticketPriceTiers.quantitySold
 *  - Decrement discount code usageCount if applicable
 *  - Debit organizer wallet by subtotalAmount (what they actually received) and write a 'refund' transaction
 *  - Send refund notification email to the buyer (best-effort, non-blocking)
 *
 * Caller is responsible for invoking the payment provider (PayMongo/PayPal) before this helper
 * so that provider-side failures don't leave the DB in a refunded state.
 */
export async function refundPaidOrder(params: RefundParams): Promise<void> {
  const { order, refundedAmount, refundedBy, reason, paymongoRefundId, paypalRefundId } = params
  const db = useDatabase()

  await db.transaction(async (tx) => {
    // Get tickets in the order so we can release inventory
    const orderTickets = await tx
      .select({
        ticketTypeId: tickets.ticketTypeId,
        priceTierName: tickets.priceTierName,
      })
      .from(tickets)
      .where(eq(tickets.orderId, order.id))

    // Decrement ticketTypes.quantitySold per ticket type
    const ticketTypeCountMap = new Map<string, number>()
    for (const t of orderTickets) {
      ticketTypeCountMap.set(t.ticketTypeId, (ticketTypeCountMap.get(t.ticketTypeId) || 0) + 1)
    }
    for (const [ttId, count] of ticketTypeCountMap) {
      await tx
        .update(ticketTypes)
        .set({
          quantitySold: sql`GREATEST(${ticketTypes.quantitySold} - ${count}, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(ticketTypes.id, ttId))
    }

    // Decrement ticketPriceTiers.quantitySold (grouped by ticketTypeId + priceTierName)
    const tierCountMap = new Map<string, { ticketTypeId: string; priceTierName: string; count: number }>()
    for (const t of orderTickets) {
      if (!t.priceTierName) continue
      const key = `${t.ticketTypeId}:${t.priceTierName}`
      const existing = tierCountMap.get(key)
      if (existing) {
        existing.count++
      } else {
        tierCountMap.set(key, { ticketTypeId: t.ticketTypeId, priceTierName: t.priceTierName, count: 1 })
      }
    }
    for (const { ticketTypeId, priceTierName, count } of tierCountMap.values()) {
      await tx
        .update(ticketPriceTiers)
        .set({
          quantitySold: sql`GREATEST(${ticketPriceTiers.quantitySold} - ${count}, 0)`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(ticketPriceTiers.ticketTypeId, ticketTypeId),
            eq(ticketPriceTiers.name, priceTierName),
          ),
        )
    }

    // Mark all tickets refunded
    await tx
      .update(tickets)
      .set({ status: 'refunded', updatedAt: new Date() })
      .where(eq(tickets.orderId, order.id))

    // Decrement discount code usage if applicable
    if (order.discountCodeId) {
      const [discountCode] = await tx
        .select({ ticketTypeIds: discountCodes.ticketTypeIds })
        .from(discountCodes)
        .where(eq(discountCodes.id, order.discountCodeId))
        .limit(1)

      if (discountCode) {
        const applicableTicketTypeIds = discountCode.ticketTypeIds as string[] | null
        let applicableTicketCount = 0
        for (const t of orderTickets) {
          if (
            !applicableTicketTypeIds ||
            applicableTicketTypeIds.length === 0 ||
            applicableTicketTypeIds.includes(t.ticketTypeId)
          ) {
            applicableTicketCount++
          }
        }
        if (applicableTicketCount > 0) {
          await tx
            .update(discountCodes)
            .set({
              usageCount: sql`GREATEST(${discountCodes.usageCount} - ${applicableTicketCount}, 0)`,
              updatedAt: new Date(),
            })
            .where(eq(discountCodes.id, order.discountCodeId))
        }
      }
    }

    // Update order with refund metadata
    await tx
      .update(orders)
      .set({
        paymentStatus: 'refunded',
        refundedAmount: refundedAmount.toFixed(2),
        refundedAt: new Date(),
        refundReason: reason || null,
        refundedBy,
        paymongoRefundId: paymongoRefundId || null,
        paypalRefundId: paypalRefundId || null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))

    // Wallet bookkeeping. The organizer's wallet originally received `subtotalAmount`
    // (see processPaymentReceived in wallet.ts). On refund we debit that exact amount so
    // the ledger reflects what the organizer actually loses. Fees retained by the platform
    // never touched the organizer's wallet, so they don't affect this entry.
    if (order.paymentMethod !== 'external') {
      const subtotalAmount = parseFloat(order.subtotalAmount)

      // Find the organizer's wallet via the event
      const [eventRow] = await tx
        .select({ organizerId: events.organizerId })
        .from(events)
        .where(eq(events.id, order.eventId))
        .limit(1)

      if (eventRow) {
        const [wallet] = await tx
          .select()
          .from(wallets)
          .where(eq(wallets.userId, eventRow.organizerId))
          .limit(1)

        if (wallet) {
          // Idempotency: skip if a refund transaction already exists for this order
          const [existing] = await tx
            .select({ id: transactions.id })
            .from(transactions)
            .where(and(eq(transactions.orderId, order.id), eq(transactions.type, 'refund')))
            .limit(1)

          if (!existing) {
            await tx.insert(transactions).values({
              walletId: wallet.id,
              type: 'refund',
              amount: subtotalAmount.toFixed(2),
              fee: '0',
              netAmount: (-subtotalAmount).toFixed(2),
              currency: 'PHP',
              status: 'completed',
              description: `Refund: ${order.orderNumber}`,
              orderId: order.id,
              eventId: order.eventId,
              metadata: {
                refundedAmount,
                feesRetained: parseFloat(order.totalAmount) - refundedAmount,
                reason: reason || null,
              },
            })

            // Debit the wallet: take from available first, then pending if needed
            const available = parseFloat(wallet.availableBalance)
            if (available >= subtotalAmount) {
              await tx
                .update(wallets)
                .set({
                  availableBalance: sql`${wallets.availableBalance} - ${subtotalAmount}`,
                  totalEarnings: sql`${wallets.totalEarnings} - ${subtotalAmount}`,
                  updatedAt: new Date(),
                })
                .where(eq(wallets.id, wallet.id))
            } else {
              const fromPending = subtotalAmount - available
              await tx
                .update(wallets)
                .set({
                  availableBalance: '0',
                  pendingBalance: sql`${wallets.pendingBalance} - ${fromPending}`,
                  totalEarnings: sql`${wallets.totalEarnings} - ${subtotalAmount}`,
                  updatedAt: new Date(),
                })
                .where(eq(wallets.id, wallet.id))
            }
          }
        }
      }
    }
  })

  // Best-effort email notification (outside the transaction so a mail outage doesn't roll back)
  try {
    const db = useDatabase()
    const [eventRow] = await db
      .select({ title: events.title })
      .from(events)
      .where(eq(events.id, order.eventId))
      .limit(1)
    const [customer] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, order.userId))
      .limit(1)

    if (eventRow && customer) {
      const formatPhp = (amount: number) =>
        new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount)
      const formattedRefund = formatPhp(refundedAmount)
      const eventTitle = eventRow.title

      await sendEmail({
        to: customer.email,
        subject: `Refund processed for ${eventTitle} — Order ${order.orderNumber}`,
        html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 40px; width: auto;" />
  </div>
  <h2 style="color: #111; margin-bottom: 10px;">Refund Processed</h2>
  <p>Hi ${customer.name || 'there'},</p>
  <p>Your refund for <strong>${eventTitle}</strong> has been processed.</p>
  <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0;"><strong>Order Number:</strong> ${order.orderNumber}</p>
    <p style="margin: 0 0 10px 0;"><strong>Refund Amount:</strong> ${formattedRefund}</p>
    <p style="margin: 0;"><strong>Status:</strong> Processing</p>
  </div>
  <p style="color: #666; font-size: 14px;">
    The refund will be credited back to your original payment method within 5-10 business days, depending on your bank or e-wallet provider.
  </p>
  ${reason ? `<p style="color: #666; font-size: 14px;"><strong>Reason:</strong> ${reason}</p>` : ''}
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="color: #666; font-size: 14px;">If you have any questions, please contact the event organizer.<br>The nvyt Team</p>
</body>
</html>`,
      })
    }
  } catch (err) {
    console.error('[Refund] Failed to send refund notification:', err)
  }
}

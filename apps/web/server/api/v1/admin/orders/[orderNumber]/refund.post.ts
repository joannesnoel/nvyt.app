import { eq } from 'drizzle-orm'
import { orders } from '@nvyt/db'
import { createRefund, getPaymentIntent, toCentavos } from '~/server/utils/paymongo'
import { refundPayPalCapture, toCents } from '~/server/utils/paypal'
import { refundPaidOrder } from '~/server/utils/refundOrder'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  requireAdmin(user.email)

  const orderNumber = getRouterParam(event, 'orderNumber')
  if (!orderNumber) {
    throw createError({ statusCode: 400, message: 'Order number is required' })
  }

  const body = await readBody<{ amount?: number; reason?: string }>(event)
  const requestedAmount = Number(body?.amount)
  const reason = body?.reason?.toString().trim() || undefined

  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    throw createError({ statusCode: 400, message: 'amount must be a positive number' })
  }

  const db = useDatabase()

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1)

  if (!order) {
    throw createError({ statusCode: 404, message: 'Order not found' })
  }

  if (order.paymentStatus !== 'paid') {
    throw createError({
      statusCode: 400,
      message: `Cannot refund order with status: ${order.paymentStatus}`,
    })
  }

  const totalAmount = parseFloat(order.totalAmount)
  // Round to 2dp for the comparison so floating-point math doesn't reject valid full-amount refunds
  const refundedAmount = Math.round(requestedAmount * 100) / 100

  if (refundedAmount > totalAmount + 0.001) {
    throw createError({
      statusCode: 400,
      message: `Refund amount (${refundedAmount}) exceeds order total (${totalAmount})`,
    })
  }

  let paymongoRefundId: string | null = null
  let paypalRefundId: string | null = null

  // External (cash/manual) and free orders skip the provider call
  const isExternal = order.paymentMethod === 'external'
  const isFree = totalAmount === 0

  if (!isExternal && !isFree) {
    if (order.paymentProvider === 'paypal') {
      if (!order.paypalCaptureId) {
        throw createError({
          statusCode: 400,
          message: 'Cannot refund: missing PayPal capture id on order',
        })
      }
      try {
        const refund = await refundPayPalCapture(
          order.paypalCaptureId,
          toCents(refundedAmount),
          'PHP',
          reason,
        )
        paypalRefundId = refund.id
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'PayPal refund failed'
        console.error('[Admin Refund] PayPal error:', err)
        throw createError({ statusCode: 502, message: msg })
      }
    } else {
      // PayMongo (default)
      if (!order.paymongoPaymentIntentId) {
        throw createError({
          statusCode: 400,
          message: 'Cannot refund: missing PayMongo payment intent on order',
        })
      }
      let paymentId: string | null = null
      try {
        const intent = await getPaymentIntent(order.paymongoPaymentIntentId)
        paymentId = intent.attributes.payments?.[0]?.id ?? null
      } catch (err) {
        console.error('[Admin Refund] Failed to fetch PayMongo payment intent:', err)
        throw createError({ statusCode: 502, message: 'Failed to retrieve payment information' })
      }
      if (!paymentId) {
        throw createError({ statusCode: 400, message: 'No payment found for this order' })
      }
      try {
        const refund = await createRefund(paymentId, toCentavos(refundedAmount), reason || 'requested_by_customer')
        paymongoRefundId = refund.id
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'PayMongo refund failed'
        console.error('[Admin Refund] PayMongo error:', err)
        throw createError({ statusCode: 502, message: msg })
      }
    }
  }

  await refundPaidOrder({
    order,
    refundedAmount,
    refundedBy: user.id,
    reason,
    paymongoRefundId,
    paypalRefundId,
  })

  return successResponse({
    orderNumber: order.orderNumber,
    refundedAmount,
    paymongoRefundId,
    paypalRefundId,
  })
})

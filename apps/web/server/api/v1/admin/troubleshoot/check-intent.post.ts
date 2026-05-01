import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { orders } from '@nvyt/db'
import { getPaymentIntent } from '~/server/utils/paymongo'

const bodySchema = z.object({
  orderNumber: z.string().min(1),
})

/**
 * Fetch live PayMongo PaymentIntent state for a single order. Read-only.
 *
 * POST /api/v1/admin/troubleshoot/check-intent
 * Body: { orderNumber }
 *
 * Response: {
 *   orderNumber, paymentIntentId, paymentIntentStatus,
 *   paymentIntentExists, payments: [{ id, status, amount, source }], orderStatus
 * }
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  requireAdmin(user.email)

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: 'Validation failed', data: parsed.error.flatten() })
  }

  const { orderNumber } = parsed.data
  const db = useDatabase()

  const [order] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      paymentStatus: orders.paymentStatus,
      paymentIntentId: orders.paymongoPaymentIntentId,
      totalAmount: orders.totalAmount,
    })
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1)

  if (!order) {
    throw createError({ statusCode: 404, message: 'Order not found' })
  }
  if (!order.paymentIntentId) {
    throw createError({ statusCode: 400, message: 'Order has no PayMongo payment intent' })
  }

  try {
    const intent = await getPaymentIntent(order.paymentIntentId)
    const payments = (intent.attributes.payments ?? []).map((p) => ({
      id: p.id,
      status: p.attributes.status,
      amount: p.attributes.amount,
      sourceType: p.attributes.source?.type ?? null,
    }))

    return successResponse({
      orderNumber: order.orderNumber,
      paymentIntentId: order.paymentIntentId,
      paymentIntentExists: true,
      paymentIntentStatus: intent.attributes.status,
      paymentIntentAmount: intent.attributes.amount,
      payments,
      orderStatus: order.paymentStatus,
    })
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 404) {
      return successResponse({
        orderNumber: order.orderNumber,
        paymentIntentId: order.paymentIntentId,
        paymentIntentExists: false,
        paymentIntentStatus: null,
        paymentIntentAmount: null,
        payments: [],
        orderStatus: order.paymentStatus,
      })
    }
    throw err
  }
})

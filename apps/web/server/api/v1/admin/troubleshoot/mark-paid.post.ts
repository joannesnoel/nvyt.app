import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { orders } from '@nvyt/db'
import { getPaymentIntent, getPaymentMethod } from '~/server/utils/paymongo'
import { markOrderPaid } from '~/server/utils/markOrderPaid'

const bodySchema = z.object({
  orderNumber: z.string().min(1),
  force: z.boolean().optional(),
})

/**
 * Promote a failed order to paid after confirming PayMongo says the payment intent
 * succeeded. Runs the same success path as the customer return / reconcile flows
 * (update order, confirm tickets, wallet entry, confirmation email).
 *
 * POST /api/v1/admin/troubleshoot/mark-paid
 * Body: { orderNumber, force? }
 *
 * If force=true, the PayMongo PI status check is skipped (use only when you've
 * already verified the payment via another channel).
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  requireAdmin(user.email)

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: 'Validation failed', data: parsed.error.flatten() })
  }

  const { orderNumber, force } = parsed.data
  const db = useDatabase()

  const [order] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      paymentStatus: orders.paymentStatus,
      paymentIntentId: orders.paymongoPaymentIntentId,
      paymentProvider: orders.paymentProvider,
    })
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1)

  if (!order) {
    throw createError({ statusCode: 404, message: 'Order not found' })
  }
  if (order.paymentProvider !== 'paymongo') {
    throw createError({ statusCode: 400, message: 'Order is not a PayMongo order' })
  }
  if (order.paymentStatus === 'paid') {
    return successResponse({
      orderNumber: order.orderNumber,
      alreadyPaid: true,
      paymentIntentStatus: null,
    })
  }
  if (!order.paymentIntentId) {
    throw createError({ statusCode: 400, message: 'Order has no PayMongo payment intent' })
  }

  let resolvedPaymentMethod: string | null = null
  let intentStatus: string | null = null

  if (!force) {
    const intent = await getPaymentIntent(order.paymentIntentId)
    intentStatus = intent.attributes.status
    if (intentStatus !== 'succeeded') {
      throw createError({
        statusCode: 409,
        message: `Cannot mark paid: PayMongo reports payment intent status "${intentStatus}". Pass force=true to override.`,
      })
    }
    resolvedPaymentMethod = getPaymentMethod(intent)
  }

  const result = await markOrderPaid({
    orderId: order.id,
    paymentMethod: resolvedPaymentMethod,
  })

  console.log(
    `[Troubleshoot] mark-paid by ${user.email} — order=${order.orderNumber} ` +
      `pi=${order.paymentIntentId} force=${!!force} alreadyPaid=${result.alreadyPaid} ` +
      `wallet=${result.walletRecorded} email=${result.emailSent} warnings=${result.warnings.length}`
  )

  return successResponse({
    orderNumber: order.orderNumber,
    alreadyPaid: result.alreadyPaid,
    walletRecorded: result.walletRecorded,
    emailSent: result.emailSent,
    warnings: result.warnings,
    paymentIntentStatus: intentStatus,
  })
})

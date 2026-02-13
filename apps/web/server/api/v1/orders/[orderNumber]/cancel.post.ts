import { orders } from '@nvyt/db'
import { eq } from 'drizzle-orm'
import { cancelPendingOrder } from '~/server/utils/orderCleanup'

export default defineEventHandler(async (event) => {
  const orderNumber = getRouterParam(event, 'orderNumber')

  if (!orderNumber) {
    throw createError({
      statusCode: 400,
      message: 'Order number is required',
    })
  }

  const db = useDatabase()

  // Require authenticated user
  const user = await getUserFromEvent(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'Authentication required',
    })
  }

  // Get order
  const [result] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      userId: orders.userId,
      paymentStatus: orders.paymentStatus,
      discountCodeId: orders.discountCodeId,
    })
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1)

  if (!result) {
    throw createError({
      statusCode: 404,
      message: 'Order not found',
    })
  }

  // Verify the user owns this order
  if (result.userId !== user.id) {
    throw createError({
      statusCode: 403,
      message: 'You are not authorized to cancel this order',
    })
  }

  // Only allow cancellation for pending orders
  if (result.paymentStatus !== 'pending') {
    throw createError({
      statusCode: 400,
      message: 'Only pending orders can be cancelled',
    })
  }

  await cancelPendingOrder(result)

  console.log(`[Cancel Order] User ${user.id} cancelled order ${orderNumber}`)

  return successResponse({ message: 'Order cancelled' })
})

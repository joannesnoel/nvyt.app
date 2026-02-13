import { orders } from '@nvyt/db'
import { eq, and, lt, sql } from 'drizzle-orm'
import { cancelPendingOrder } from '~/server/utils/orderCleanup'

const STALE_ORDER_THRESHOLD_HOURS = 2

export default defineEventHandler(async (event) => {
  // Authenticate with cron secret
  const config = useRuntimeConfig()
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!config.cronSecret || token !== config.cronSecret) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    })
  }

  const db = useDatabase()
  const cutoff = new Date(Date.now() - STALE_ORDER_THRESHOLD_HOURS * 60 * 60 * 1000)

  // Find all stale pending orders
  const stalePendingOrders = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      discountCodeId: orders.discountCodeId,
    })
    .from(orders)
    .where(
      and(
        eq(orders.paymentStatus, 'pending'),
        lt(orders.createdAt, cutoff)
      )
    )

  const expiredOrderNumbers: string[] = []

  for (const pendingOrder of stalePendingOrders) {
    await cancelPendingOrder(pendingOrder)
    expiredOrderNumbers.push(pendingOrder.orderNumber)
    console.log(`[Cron] Expired stale pending order ${pendingOrder.orderNumber}`)
  }

  console.log(`[Cron] Expired ${expiredOrderNumbers.length} stale pending orders`)

  return successResponse({
    expiredCount: expiredOrderNumbers.length,
    expiredOrders: expiredOrderNumbers,
  })
})

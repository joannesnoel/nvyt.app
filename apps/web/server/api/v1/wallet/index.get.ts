import { eq, sql, and } from 'drizzle-orm'
import { wallets, orders, events, payouts } from '@nvyt/db'
import { getOrCreateWallet } from '~/server/utils/wallet'

export default defineEventHandler(async (event) => {
  // Require authentication
  const user = await requireAuth(event)
  const userId = user.id
  const db = useDatabase()

  // Get or create wallet for the user
  const wallet = await getOrCreateWallet(userId)

  if (!wallet) {
    throw createError({
      statusCode: 500,
      message: 'Failed to get or create wallet',
    })
  }

  // Calculate net earnings from orders (source of truth), excluding external payments
  const [earningsResult] = await db
    .select({
      totalEarnings: sql<string>`COALESCE(SUM(${orders.subtotalAmount}::numeric - ${orders.discountAmount}::numeric), 0)`,
    })
    .from(orders)
    .innerJoin(events, eq(orders.eventId, events.id))
    .where(
      and(
        eq(events.organizerId, userId),
        eq(orders.paymentStatus, 'paid'),
        sql`${orders.paymentMethod} is distinct from 'external'`
      )
    )

  // Calculate completed payouts from the payouts table (source of truth)
  const [payoutsResult] = await db
    .select({
      totalPayouts: sql<string>`COALESCE(SUM(${payouts.amount}), 0)`,
    })
    .from(payouts)
    .where(
      and(
        eq(payouts.walletId, wallet.id),
        eq(payouts.status, 'completed')
      )
    )

  const totalEarnings = parseFloat(earningsResult?.totalEarnings || '0')
  const totalPayouts = parseFloat(payoutsResult?.totalPayouts || '0')
  const availableBalance = totalEarnings - totalPayouts

  return successResponse({
    wallet: {
      id: wallet.id,
      availableBalance: availableBalance.toFixed(2),
      pendingBalance: wallet.pendingBalance,
      totalEarnings: totalEarnings.toFixed(2),
      currency: wallet.currency,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    },
  })
})

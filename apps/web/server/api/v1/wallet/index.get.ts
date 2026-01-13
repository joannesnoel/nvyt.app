import { eq } from 'drizzle-orm'
import { wallets } from '@nvyt/db'
import { getOrCreateWallet } from '~/server/utils/wallet'

export default defineEventHandler(async (event) => {
  // Require authentication
  const user = await requireAuth(event)
  const userId = user.id

  // Get or create wallet for the user
  const wallet = await getOrCreateWallet(userId)

  return successResponse({
    wallet: {
      id: wallet.id,
      availableBalance: wallet.availableBalance,
      pendingBalance: wallet.pendingBalance,
      totalEarnings: wallet.totalEarnings,
      currency: wallet.currency,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    },
  })
})

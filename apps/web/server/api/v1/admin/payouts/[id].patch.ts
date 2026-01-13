import { eq } from 'drizzle-orm'
import { payouts, wallets, transactions } from '@nvyt/db'
import { z } from 'zod'
import { recordTransaction } from '~/server/utils/wallet'

const updateSchema = z.object({
  status: z.enum(['processing', 'completed', 'rejected']),
  rejectionReason: z.string().optional(),
  notes: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  // Require authentication
  const user = await requireAuth(event)

  // Check if user is admin
  requireAdmin(user.email)

  const payoutId = getRouterParam(event, 'id')
  if (!payoutId) {
    throw createError({
      statusCode: 400,
      message: 'Payout ID is required',
    })
  }

  const db = useDatabase()

  // Parse request body
  const body = await readBody(event)
  const result = updateSchema.safeParse(body)

  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Invalid request body',
      data: result.error.flatten(),
    })
  }

  const { status, rejectionReason, notes } = result.data

  // Get the payout
  const [payout] = await db
    .select()
    .from(payouts)
    .where(eq(payouts.id, payoutId))
    .limit(1)

  if (!payout) {
    throw createError({
      statusCode: 404,
      message: 'Payout not found',
    })
  }

  // Validate status transitions
  if (payout.status === 'completed') {
    throw createError({
      statusCode: 400,
      message: 'Cannot update a completed payout',
    })
  }

  if (payout.status === 'rejected') {
    throw createError({
      statusCode: 400,
      message: 'Cannot update a rejected payout',
    })
  }

  // If rejecting, restore the balance to the wallet
  if (status === 'rejected') {
    if (!rejectionReason) {
      throw createError({
        statusCode: 400,
        message: 'Rejection reason is required when rejecting a payout',
      })
    }

    // Restore balance to wallet
    await db
      .update(wallets)
      .set({
        availableBalance: wallets.availableBalance,
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, payout.walletId))

    // Actually add back the amount
    const [wallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, payout.walletId))
      .limit(1)

    if (wallet) {
      const currentBalance = parseFloat(wallet.availableBalance)
      const payoutAmount = parseFloat(payout.amount)

      await db
        .update(wallets)
        .set({
          availableBalance: String(currentBalance + payoutAmount),
          updatedAt: new Date(),
        })
        .where(eq(wallets.id, payout.walletId))
    }
  }

  // Update the payout
  const [updatedPayout] = await db
    .update(payouts)
    .set({
      status,
      rejectionReason: status === 'rejected' ? rejectionReason : null,
      notes,
      processedBy: user.id,
      processedAt: status === 'completed' || status === 'rejected' ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(payouts.id, payoutId))
    .returning()

  // If completed, record a payout transaction
  if (status === 'completed') {
    await recordTransaction({
      walletId: payout.walletId,
      type: 'payout',
      amount: `-${payout.amount}`,
      netAmount: `-${payout.netAmount}`,
      description: `Payout processed`,
      payoutId: payout.id,
      status: 'completed',
    })
  }

  return successResponse({
    payout: updatedPayout,
    message: status === 'completed'
      ? 'Payout marked as completed'
      : status === 'rejected'
      ? 'Payout rejected and balance restored'
      : 'Payout status updated',
  })
})

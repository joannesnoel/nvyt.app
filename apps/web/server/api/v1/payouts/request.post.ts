import { eq, and, inArray } from 'drizzle-orm'
import { payouts, payoutSettings, wallets, transactions } from '@nvyt/db'
import { z } from 'zod'
import { getOrCreateWallet, deductForPayout, recordTransaction } from '~/server/utils/wallet'

const requestSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
})

// Minimum payout amount (in PHP)
const MINIMUM_PAYOUT = 500

export default defineEventHandler(async (event) => {
  // Require authentication
  const user = await requireAuth(event)
  const userId = user.id
  const db = useDatabase()

  // Parse request body
  const body = await readBody(event)
  const result = requestSchema.safeParse(body)

  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Invalid request data',
      data: result.error.flatten(),
    })
  }

  const { amount } = result.data

  // Check minimum payout amount
  if (amount < MINIMUM_PAYOUT) {
    throw createError({
      statusCode: 400,
      message: `Minimum payout amount is ₱${MINIMUM_PAYOUT}`,
    })
  }

  // Get wallet
  const wallet = await getOrCreateWallet(userId)
  const availableBalance = parseFloat(wallet.availableBalance)

  // Check if user has sufficient balance
  if (amount > availableBalance) {
    throw createError({
      statusCode: 400,
      message: `Insufficient balance. Available: ₱${availableBalance.toFixed(2)}`,
    })
  }

  // Check if there's already a pending payout
  const [existingPayout] = await db
    .select()
    .from(payouts)
    .where(
      and(
        eq(payouts.userId, userId),
        inArray(payouts.status, ['pending', 'processing'])
      )
    )
    .limit(1)

  if (existingPayout) {
    throw createError({
      statusCode: 400,
      message: 'You already have a pending payout request. Please wait for it to be processed.',
    })
  }

  // Get payout settings for bank details
  const [settings] = await db
    .select()
    .from(payoutSettings)
    .where(eq(payoutSettings.userId, userId))
    .limit(1)

  if (!settings || !settings.bankName || !settings.accountName || !settings.accountNumber) {
    throw createError({
      statusCode: 400,
      message: 'Please set up your bank details before requesting a payout.',
    })
  }

  // Create payout request (no fee for now)
  const payoutFee = 0
  const netAmount = amount - payoutFee

  const [payout] = await db
    .insert(payouts)
    .values({
      walletId: wallet.id,
      userId,
      amount: String(amount),
      fee: String(payoutFee),
      netAmount: String(netAmount),
      currency: 'PHP',
      status: 'pending',
      bankName: settings.bankName,
      accountName: settings.accountName,
      accountNumber: settings.accountNumber,
    })
    .returning()

  // Deduct from available balance
  await deductForPayout(wallet.id, amount)

  // Record payout transaction
  await recordTransaction({
    walletId: wallet.id,
    type: 'payout',
    amount: amount,
    fee: payoutFee,
    netAmount: -netAmount, // Negative since it's an outflow
    description: `Payout request`,
    payoutId: payout.id,
    status: 'pending',
  })

  return successResponse({
    payout: {
      id: payout.id,
      amount: payout.amount,
      fee: payout.fee,
      netAmount: payout.netAmount,
      status: payout.status,
      bankName: payout.bankName,
      accountName: payout.accountName,
      accountNumber: payout.accountNumber,
      requestedAt: payout.requestedAt,
    },
    message: 'Payout request submitted successfully. It will be processed within 3-5 business days.',
  })
})

import { eq, sql } from 'drizzle-orm'
import { wallets, transactions, type NewTransaction } from '@nvyt/db'

// Platform fee percentage (3%)
const PLATFORM_FEE_PERCENTAGE = 0.03

export interface TransactionInput {
  walletId: string
  type: 'payment_received' | 'refund' | 'payout' | 'platform_fee'
  amount: string | number
  fee?: string | number
  netAmount: string | number
  description?: string
  orderId?: string
  eventId?: string
  payoutId?: string
  metadata?: Record<string, unknown>
  status?: 'pending' | 'completed' | 'failed'
}

/**
 * Get or create a wallet for a user
 */
export async function getOrCreateWallet(userId: string) {
  const db = useDatabase()

  // Try to get existing wallet
  const [existingWallet] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .limit(1)

  if (existingWallet) {
    return existingWallet
  }

  // Create new wallet
  const [newWallet] = await db
    .insert(wallets)
    .values({
      userId,
      availableBalance: '0',
      pendingBalance: '0',
      totalEarnings: '0',
      currency: 'PHP',
    })
    .returning()

  return newWallet
}

/**
 * Record a transaction in the ledger
 */
export async function recordTransaction(input: TransactionInput) {
  const db = useDatabase()

  const transaction: NewTransaction = {
    walletId: input.walletId,
    type: input.type,
    amount: String(input.amount),
    fee: input.fee ? String(input.fee) : '0',
    netAmount: String(input.netAmount),
    currency: 'PHP',
    status: input.status || 'completed',
    description: input.description,
    orderId: input.orderId,
    eventId: input.eventId,
    payoutId: input.payoutId,
    metadata: input.metadata,
  }

  const [recorded] = await db
    .insert(transactions)
    .values(transaction)
    .returning()

  return recorded
}

/**
 * Update wallet balance after a payment is received
 * This adds to pending balance initially (until settlement)
 */
export async function addPendingPayment(walletId: string, netAmount: string | number) {
  const db = useDatabase()
  const amount = typeof netAmount === 'string' ? parseFloat(netAmount) : netAmount

  await db
    .update(wallets)
    .set({
      pendingBalance: sql`${wallets.pendingBalance} + ${amount}`,
      totalEarnings: sql`${wallets.totalEarnings} + ${amount}`,
      updatedAt: new Date(),
    })
    .where(eq(wallets.id, walletId))
}

/**
 * Move amount from pending to available balance
 * Called when payment is settled/confirmed
 */
export async function settlePendingBalance(walletId: string, amount: string | number) {
  const db = useDatabase()
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount

  await db
    .update(wallets)
    .set({
      pendingBalance: sql`${wallets.pendingBalance} - ${numAmount}`,
      availableBalance: sql`${wallets.availableBalance} + ${numAmount}`,
      updatedAt: new Date(),
    })
    .where(eq(wallets.id, walletId))
}

/**
 * Deduct from available balance (for payouts)
 */
export async function deductForPayout(walletId: string, amount: string | number) {
  const db = useDatabase()
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount

  await db
    .update(wallets)
    .set({
      availableBalance: sql`${wallets.availableBalance} - ${numAmount}`,
      updatedAt: new Date(),
    })
    .where(eq(wallets.id, walletId))
}

/**
 * Process a refund - deduct from wallet
 */
export async function processRefund(walletId: string, amount: string | number) {
  const db = useDatabase()
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount

  // Deduct from available balance first, then pending if needed
  const [wallet] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.id, walletId))
    .limit(1)

  if (!wallet) {
    throw new Error('Wallet not found')
  }

  const availableBalance = parseFloat(wallet.availableBalance)
  const pendingBalance = parseFloat(wallet.pendingBalance)

  if (availableBalance >= numAmount) {
    // Deduct entirely from available
    await db
      .update(wallets)
      .set({
        availableBalance: sql`${wallets.availableBalance} - ${numAmount}`,
        totalEarnings: sql`${wallets.totalEarnings} - ${numAmount}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, walletId))
  } else {
    // Deduct from available first, rest from pending
    const fromPending = numAmount - availableBalance
    await db
      .update(wallets)
      .set({
        availableBalance: '0',
        pendingBalance: sql`${wallets.pendingBalance} - ${fromPending}`,
        totalEarnings: sql`${wallets.totalEarnings} - ${numAmount}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, walletId))
  }
}

/**
 * Calculate platform fee and net amount for a payment
 */
export function calculateFees(grossAmount: number): {
  grossAmount: number
  platformFee: number
  netAmount: number
} {
  const platformFee = Math.round(grossAmount * PLATFORM_FEE_PERCENTAGE * 100) / 100
  const netAmount = grossAmount - platformFee

  return {
    grossAmount,
    platformFee,
    netAmount,
  }
}

/**
 * Full payment processing: create wallet if needed, record transaction, update balance
 */
export async function processPaymentReceived(params: {
  userId: string
  orderId: string
  eventId: string
  grossAmount: number
  eventTitle?: string
}) {
  const { userId, orderId, eventId, grossAmount, eventTitle } = params

  // Get or create wallet for the organizer
  const wallet = await getOrCreateWallet(userId)

  if (!wallet) {
    throw new Error('Failed to get or create wallet')
  }

  // Calculate fees
  const { platformFee, netAmount } = calculateFees(grossAmount)

  // Record a single transaction for the payment
  // - amount: gross amount received
  // - fee: platform fee deducted
  // - netAmount: what the organizer actually gets
  await recordTransaction({
    walletId: wallet.id,
    type: 'payment_received',
    amount: grossAmount,
    fee: platformFee,
    netAmount: netAmount,
    description: eventTitle ? `Ticket sale: ${eventTitle}` : 'Payment received',
    orderId,
    eventId,
    status: 'completed',
  })

  // Update wallet balance with net amount (after fee deduction)
  const db = useDatabase()
  await db
    .update(wallets)
    .set({
      availableBalance: sql`${wallets.availableBalance} + ${netAmount}`,
      totalEarnings: sql`${wallets.totalEarnings} + ${netAmount}`,
      updatedAt: new Date(),
    })
    .where(eq(wallets.id, wallet.id))

  return {
    wallet,
    grossAmount,
    platformFee,
    netAmount,
  }
}

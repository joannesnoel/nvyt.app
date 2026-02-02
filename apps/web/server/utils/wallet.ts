import { eq, and, sql } from 'drizzle-orm'
import { wallets, transactions, type NewTransaction } from '@nvyt/db'

// Processing fee constants (charged to buyer)
export const PROCESSING_FEE_RATE = 0.035 // 3.5% for PayMongo (GCash, Maya, etc.)
export const PAYPAL_PROCESSING_FEE_RATE = 0.039 // 3.9% for PayPal
export const PAYPAL_FIXED_FEE = 15 // ₱15 fixed fee for PayPal

export type PaymentProvider = 'paymongo' | 'paypal'

/**
 * Calculate processing fees for a ticket purchase (charged to buyer)
 * @param subtotal - The ticket price before fees
 * @param adminFeeRate - The admin fee rate (0-1, e.g., 0.02 = 2%)
 * @param paymentProvider - The payment provider ('paymongo' or 'paypal')
 * @returns Fee breakdown including subtotal, processing fee, admin fee, total fees, and total
 */
export function calculateProcessingFees(
  subtotal: number,
  adminFeeRate: number = 0,
  paymentProvider: PaymentProvider = 'paymongo'
) {
  if (subtotal <= 0) {
    return {
      subtotal: 0,
      processingFee: 0,
      adminFee: 0,
      totalFees: 0,
      total: 0,
    }
  }

  // Processing fee: depends on payment provider
  let processingFee: number
  if (paymentProvider === 'paypal') {
    // PayPal: 3.9% + ₱15 fixed fee
    processingFee = Math.round((subtotal * PAYPAL_PROCESSING_FEE_RATE + PAYPAL_FIXED_FEE) * 100) / 100
  } else {
    // PayMongo: 3.5%
    processingFee = Math.round(subtotal * PROCESSING_FEE_RATE * 100) / 100
  }

  // Admin fee: additional percentage set per event
  const adminFee = Math.round(subtotal * adminFeeRate * 100) / 100

  const totalFees = Math.round((processingFee + adminFee) * 100) / 100
  const total = Math.round((subtotal + totalFees) * 100) / 100

  return {
    subtotal,
    processingFee,
    adminFee,
    totalFees,
    total,
  }
}

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
 * Full payment processing: create wallet if needed, record transaction, update balance
 * Uses the actual fee breakdown from the order rather than recalculating.
 */
export async function processPaymentReceived(params: {
  userId: string
  orderId: string
  eventId: string
  grossAmount: number
  totalFees: number
  netAmount: number
  eventTitle?: string
}) {
  const { userId, orderId, eventId, grossAmount, totalFees, netAmount, eventTitle } = params

  // Guard against duplicate transactions for the same order
  const db = useDatabase()
  const [existing] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.orderId, orderId), eq(transactions.type, 'payment_received')))
    .limit(1)

  if (existing) {
    console.log(`[Wallet] Skipping duplicate payment_received for order ${orderId}`)
    const wallet = await getOrCreateWallet(userId)
    return { wallet, grossAmount, totalFees, netAmount }
  }

  // Get or create wallet for the organizer
  const wallet = await getOrCreateWallet(userId)

  if (!wallet) {
    throw new Error('Failed to get or create wallet')
  }

  // Record a single transaction for the payment
  // - amount: gross amount collected from buyer
  // - fee: total fees (processing + service)
  // - netAmount: what the organizer actually gets (subtotalAmount)
  await recordTransaction({
    walletId: wallet.id,
    type: 'payment_received',
    amount: grossAmount,
    fee: totalFees,
    netAmount: netAmount,
    description: eventTitle ? `Ticket sale: ${eventTitle}` : 'Payment received',
    orderId,
    eventId,
    status: 'completed',
  })

  // Update wallet balance with net amount (organizer's earnings)
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
    totalFees,
    netAmount,
  }
}

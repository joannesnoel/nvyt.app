import { pgTable, text, timestamp, uuid, decimal, pgEnum, jsonb } from 'drizzle-orm/pg-core'
import { users } from './users'
import { events } from './events'
import { orders } from './tickets'

// Enums
export const transactionTypeEnum = pgEnum('transaction_type', [
  'payment_received',
  'refund',
  'payout',
  'platform_fee',
])
export const transactionStatusEnum = pgEnum('transaction_status', ['pending', 'completed', 'failed'])
export const payoutStatusEnum = pgEnum('payout_status', ['pending', 'processing', 'completed', 'rejected'])

// Wallet balance per organizer
export const wallets = pgTable('wallets', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),
  availableBalance: decimal('available_balance', { precision: 12, scale: 2 }).notNull().default('0'),
  pendingBalance: decimal('pending_balance', { precision: 12, scale: 2 }).notNull().default('0'),
  totalEarnings: decimal('total_earnings', { precision: 12, scale: 2 }).notNull().default('0'),
  currency: text('currency').notNull().default('PHP'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Transaction ledger
export const transactions = pgTable('transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  walletId: uuid('wallet_id')
    .notNull()
    .references(() => wallets.id, { onDelete: 'cascade' }),
  type: transactionTypeEnum('type').notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  fee: decimal('fee', { precision: 12, scale: 2 }).default('0'),
  netAmount: decimal('net_amount', { precision: 12, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('PHP'),
  status: transactionStatusEnum('status').notNull().default('completed'),
  description: text('description'),
  // References
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
  payoutId: uuid('payout_id'), // Foreign key added via migration (circular reference)
  // Metadata
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// Payout requests
export const payouts = pgTable('payouts', {
  id: uuid('id').defaultRandom().primaryKey(),
  walletId: uuid('wallet_id')
    .notNull()
    .references(() => wallets.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  fee: decimal('fee', { precision: 12, scale: 2 }).default('0'),
  netAmount: decimal('net_amount', { precision: 12, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('PHP'),
  status: payoutStatusEnum('status').notNull().default('pending'),
  // Bank details (stored for record)
  bankName: text('bank_name'),
  accountName: text('account_name'),
  accountNumber: text('account_number'),
  // Processing info
  processedBy: uuid('processed_by').references(() => users.id, { onDelete: 'set null' }),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  notes: text('notes'),
  // Timestamps
  requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Organizer payout settings
export const payoutSettings = pgTable('payout_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),
  bankName: text('bank_name'),
  accountName: text('account_name'),
  accountNumber: text('account_number'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Type exports
export type Wallet = typeof wallets.$inferSelect
export type NewWallet = typeof wallets.$inferInsert
export type Transaction = typeof transactions.$inferSelect
export type NewTransaction = typeof transactions.$inferInsert
export type Payout = typeof payouts.$inferSelect
export type NewPayout = typeof payouts.$inferInsert
export type PayoutSettings = typeof payoutSettings.$inferSelect
export type NewPayoutSettings = typeof payoutSettings.$inferInsert

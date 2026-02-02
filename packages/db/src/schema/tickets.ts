import { pgTable, text, timestamp, uuid, integer, decimal, boolean, pgEnum, jsonb } from 'drizzle-orm/pg-core'
import { events } from './events'
import { users } from './users'
import { discountCodes, discountTypeEnum } from './discountCodes'
import type { TicketRegistrationData, AddressData } from './ticketRegistrationFields'

// Enums
export const ticketTypeStatusEnum = pgEnum('ticket_type_status', ['active', 'sold_out', 'disabled'])
export const ticketStatusEnum = pgEnum('ticket_status', ['pending', 'confirmed', 'cancelled', 'checked_in', 'refunded'])
export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'paid', 'failed', 'refunded'])
export const priceTierTypeEnum = pgEnum('price_tier_type', ['time', 'quantity', 'hybrid'])

// Ticket types/tiers for an event (e.g., VIP, General Admission)
export const ticketTypes = pgTable('ticket_types', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),

  name: text('name').notNull(), // e.g., "VIP", "General Admission"
  description: text('description'),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(), // in PHP
  quantity: integer('quantity'), // null = unlimited
  quantitySold: integer('quantity_sold').default(0).notNull(),

  // Sale period
  salesStart: timestamp('sales_start', { withTimezone: true }),
  salesEnd: timestamp('sales_end', { withTimezone: true }),

  // Limits
  maxPerOrder: integer('max_per_order').default(10).notNull(),
  minPerOrder: integer('min_per_order').default(1).notNull(),

  status: ticketTypeStatusEnum('status').default('active').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),

  // Display settings
  showAvailability: boolean('show_availability').default(true).notNull(),
  showNextTierPrice: boolean('show_next_tier_price').default(true).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Individual tickets purchased
export const tickets = pgTable('tickets', {
  id: uuid('id').defaultRandom().primaryKey(),
  ticketTypeId: uuid('ticket_type_id')
    .notNull()
    .references(() => ticketTypes.id, { onDelete: 'cascade' }),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),

  // Attendee (the actual ticket holder, may differ from purchaser)
  attendeeUserId: uuid('attendee_user_id')
    .references(() => users.id, { onDelete: 'set null' }),

  // Ticket details
  ticketNumber: text('ticket_number').notNull().unique(), // Human-readable ticket number
  qrCode: text('qr_code').notNull().unique(), // For scanning

  // Attendee info (the actual ticket holder)
  attendeeName: text('attendee_name'), // Display name for ticket
  attendeeBirthdate: text('attendee_birthdate'), // YYYY-MM-DD format for identity verification
  // Note: attendeeEmail removed - look up via attendeeUserId -> users table
  // Note: attendeeAddress and attendeeSex moved to registrationData

  // Post-payment registration data (stores { fieldId: value } responses)
  registrationData: jsonb('registration_data').$type<TicketRegistrationData>(),
  registrationCompleted: boolean('registration_completed').default(false).notNull(),
  registrationCompletedAt: timestamp('registration_completed_at', { withTimezone: true }),

  // Sort order within an order (0-indexed, set during ticket creation)
  sortOrder: integer('sort_order').default(0).notNull(),

  // Price at time of purchase (for tier pricing)
  pricePaid: decimal('price_paid', { precision: 10, scale: 2 }),
  priceTierName: text('price_tier_name'),

  status: ticketStatusEnum('status').default('pending').notNull(),
  checkedInAt: timestamp('checked_in_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Orders (payment transactions)
export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  orderNumber: text('order_number').notNull().unique(),

  // Amount breakdown
  subtotalAmount: decimal('subtotal_amount', { precision: 10, scale: 2 }).notNull(), // Ticket prices before fees
  processingFee: decimal('processing_fee', { precision: 10, scale: 2 }).default('0').notNull(), // Platform fee (3.5% + P15)
  adminFee: decimal('admin_fee', { precision: 10, scale: 2 }).default('0').notNull(), // Admin-configured fee
  totalFees: decimal('total_fees', { precision: 10, scale: 2 }).default('0').notNull(), // Sum of all fees
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(), // Final amount charged
  currency: text('currency').default('PHP').notNull(),

  // Discount code snapshot
  discountCodeId: uuid('discount_code_id')
    .references(() => discountCodes.id, { onDelete: 'set null' }),
  discountCode: text('discount_code'), // Snapshot of code string
  discountType: discountTypeEnum('discount_type'), // Snapshot at purchase time
  discountValue: decimal('discount_value', { precision: 10, scale: 2 }), // Snapshot at purchase time
  discountAmount: decimal('discount_amount', { precision: 10, scale: 2 }).default('0').notNull(), // Actual PHP deducted

  // PayMongo integration
  paymongoPaymentIntentId: text('paymongo_payment_intent_id'),
  paymongoCheckoutSessionId: text('paymongo_checkout_session_id'),
  paymentMethod: text('payment_method'), // gcash, maya, card, etc.

  // PayPal integration
  paypalOrderId: text('paypal_order_id'),
  paypalCaptureId: text('paypal_capture_id'), // For refunds
  paymentProvider: text('payment_provider').default('paymongo'), // 'paymongo' | 'paypal'

  paymentStatus: paymentStatusEnum('payment_status').default('pending').notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),

  // Customer info
  customerName: text('customer_name').notNull(),
  customerEmail: text('customer_email').notNull(),
  customerPhone: text('customer_phone'),

  // Event requirements responses (stored as JSON array)
  requirementResponses: jsonb('requirement_responses').$type<Array<{ requirementId: string; response: boolean }>>(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Price tiers for ticket types (time-based, quantity-based, or hybrid pricing)
export const ticketPriceTiers = pgTable('ticket_price_tiers', {
  id: uuid('id').defaultRandom().primaryKey(),
  ticketTypeId: uuid('ticket_type_id')
    .notNull()
    .references(() => ticketTypes.id, { onDelete: 'cascade' }),

  name: text('name').notNull(), // "Early Bird", "Regular", "Last Minute"
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),

  // Tier type: 'time' (date-based), 'quantity' (sold count-based), 'hybrid' (both)
  tierType: priceTierTypeEnum('tier_type').default('time').notNull(),

  // Time-based constraints (required for 'time' and 'hybrid' tiers)
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),

  // Quantity-based constraints (required for 'quantity' and 'hybrid' tiers)
  quantityLimit: integer('quantity_limit'), // max tickets at this tier price
  quantitySold: integer('quantity_sold').default(0).notNull(), // tickets sold at this tier

  sortOrder: integer('sort_order').default(0).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Types
export type TicketType = typeof ticketTypes.$inferSelect
export type NewTicketType = typeof ticketTypes.$inferInsert
export type Ticket = typeof tickets.$inferSelect
export type NewTicket = typeof tickets.$inferInsert
export type Order = typeof orders.$inferSelect
export type NewOrder = typeof orders.$inferInsert
export type TicketPriceTier = typeof ticketPriceTiers.$inferSelect
export type NewTicketPriceTier = typeof ticketPriceTiers.$inferInsert

import { pgTable, text, timestamp, uuid, integer, decimal, boolean, pgEnum } from 'drizzle-orm/pg-core'
import { events } from './events'
import { users } from './users'

// Enums
export const ticketTypeStatusEnum = pgEnum('ticket_type_status', ['active', 'sold_out', 'disabled'])
export const ticketStatusEnum = pgEnum('ticket_status', ['pending', 'confirmed', 'cancelled', 'checked_in', 'refunded'])
export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'paid', 'failed', 'refunded'])

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

  // Ticket details
  ticketNumber: text('ticket_number').notNull().unique(), // Human-readable ticket number
  qrCode: text('qr_code').notNull().unique(), // For scanning

  // Attendee info (may differ from purchaser)
  attendeeName: text('attendee_name'),
  attendeeEmail: text('attendee_email'),

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
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').default('PHP').notNull(),

  // PayMongo integration
  paymongoPaymentIntentId: text('paymongo_payment_intent_id'),
  paymongoCheckoutSessionId: text('paymongo_checkout_session_id'),
  paymentMethod: text('payment_method'), // gcash, maya, card, etc.

  paymentStatus: paymentStatusEnum('payment_status').default('pending').notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),

  // Customer info
  customerName: text('customer_name').notNull(),
  customerEmail: text('customer_email').notNull(),
  customerPhone: text('customer_phone'),

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

import { pgTable, text, timestamp, uuid, integer, decimal, boolean, pgEnum, jsonb, uniqueIndex } from 'drizzle-orm/pg-core'
import { events } from './events'

export const discountTypeEnum = pgEnum('discount_type', ['percentage', 'fixed'])

export const discountCodes = pgTable('discount_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),

  code: text('code').notNull(), // Uppercase, unique per event
  description: text('description'), // Internal note for organizer

  discountType: discountTypeEnum('discount_type').notNull(),
  discountValue: decimal('discount_value', { precision: 10, scale: 2 }).notNull(), // % (0-100) or PHP amount

  usageLimit: integer('usage_limit'), // null = unlimited
  usageCount: integer('usage_count').default(0).notNull(),

  ticketTypeIds: jsonb('ticket_type_ids').$type<string[]>(), // null = all ticket types

  isActive: boolean('is_active').default(true).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueCodePerEvent: uniqueIndex('discount_codes_event_code_unique').on(table.eventId, table.code),
}))

// Types
export type DiscountCode = typeof discountCodes.$inferSelect
export type NewDiscountCode = typeof discountCodes.$inferInsert

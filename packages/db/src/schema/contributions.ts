import { pgTable, text, timestamp, uuid, integer, pgEnum } from 'drizzle-orm/pg-core'
import { events } from './events'
import { users } from './users'

// Enums
export const contributionCategoryEnum = pgEnum('contribution_category', ['food', 'drinks', 'supplies', 'equipment', 'other'])

// Contribution list items (what the organizer wants attendees to bring)
export const contributionItems = pgTable('contribution_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),

  name: text('name').notNull(), // e.g., "Pasta Salad", "Plastic Cups"
  description: text('description'),
  category: contributionCategoryEnum('category').default('other').notNull(),

  // Quantity needed
  quantityNeeded: integer('quantity_needed').default(1).notNull(),
  quantityClaimed: integer('quantity_claimed').default(0).notNull(),

  sortOrder: integer('sort_order').default(0).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Claims (who's bringing what)
export const contributionClaims = pgTable('contribution_claims', {
  id: uuid('id').defaultRandom().primaryKey(),
  contributionItemId: uuid('contribution_item_id')
    .notNull()
    .references(() => contributionItems.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  quantity: integer('quantity').default(1).notNull(),
  notes: text('notes'), // e.g., "I'll bring homemade pasta salad"

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Types
export type ContributionItem = typeof contributionItems.$inferSelect
export type NewContributionItem = typeof contributionItems.$inferInsert
export type ContributionClaim = typeof contributionClaims.$inferSelect
export type NewContributionClaim = typeof contributionClaims.$inferInsert

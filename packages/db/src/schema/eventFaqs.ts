import { pgTable, text, timestamp, uuid, integer, boolean } from 'drizzle-orm/pg-core'
import { events } from './events'

// Event FAQs table (frequently asked questions for events)
export const eventFaqs = pgTable('event_faqs', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),

  // FAQ content
  question: text('question').notNull(),
  answer: text('answer').notNull(),

  // Ordering and status
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Types
export type EventFaq = typeof eventFaqs.$inferSelect
export type NewEventFaq = typeof eventFaqs.$inferInsert

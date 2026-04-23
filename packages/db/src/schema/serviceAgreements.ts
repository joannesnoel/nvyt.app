import { pgTable, text, timestamp, uuid, pgEnum } from 'drizzle-orm/pg-core'
import { events } from './events'
import { users } from './users'

export const serviceAgreementStatusEnum = pgEnum('service_agreement_status', [
  'draft',
  'published',
])

export const serviceAgreements = pgTable('service_agreements', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id')
    .notNull()
    .unique()
    .references(() => events.id, { onDelete: 'cascade' }),

  // Generated HTML content
  content: text('content').notNull(),

  // Status
  status: serviceAgreementStatusEnum('status').default('draft').notNull(),

  // Admin who generated/last edited
  generatedBy: uuid('generated_by')
    .notNull()
    .references(() => users.id, { onDelete: 'set null' }),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Types
export type ServiceAgreement = typeof serviceAgreements.$inferSelect
export type NewServiceAgreement = typeof serviceAgreements.$inferInsert

import { pgTable, text, timestamp, uuid, integer, boolean, pgEnum, jsonb } from 'drizzle-orm/pg-core'
import { events } from './events'

// Enum for requirement type
export const requirementTypeEnum = pgEnum('requirement_type', ['checkbox', 'yes_no'])

// Event requirements table (organizer-defined terms/questions that attendees must agree to)
export const eventRequirements = pgTable('event_requirements', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),

  // Requirement content
  type: requirementTypeEnum('type').notNull(), // 'checkbox' or 'yes_no'
  text: text('text').notNull(), // The statement or question
  description: text('description'), // Optional additional context

  // For yes_no type: which answer is required (true = "Yes" required, false = "No" required)
  requiredAnswer: boolean('required_answer'),

  // Ordering and status
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Types
export type EventRequirement = typeof eventRequirements.$inferSelect
export type NewEventRequirement = typeof eventRequirements.$inferInsert

// Type for requirement responses stored in orders
export type RequirementResponse = {
  requirementId: string
  response: boolean
}

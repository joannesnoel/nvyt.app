import { pgTable, text, timestamp, uuid, pgEnum } from 'drizzle-orm/pg-core'
import { events } from './events'
import { users } from './users'

// Enums
export const rsvpStatusEnum = pgEnum('rsvp_status', ['pending', 'confirmed', 'declined', 'waitlisted', 'cancelled'])

// RSVPs for free events (non-ticketed)
export const attendees = pgTable('attendees', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  status: rsvpStatusEnum('status').default('pending').notNull(),

  // For invite-only events
  invitedBy: uuid('invited_by').references(() => users.id),
  invitedAt: timestamp('invited_at', { withTimezone: true }),

  // Response tracking
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  checkedInAt: timestamp('checked_in_at', { withTimezone: true }),

  // QR code for check-in (free events)
  qrCode: text('qr_code').unique(),

  // Notes from organizer
  notes: text('notes'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Types
export type Attendee = typeof attendees.$inferSelect
export type NewAttendee = typeof attendees.$inferInsert

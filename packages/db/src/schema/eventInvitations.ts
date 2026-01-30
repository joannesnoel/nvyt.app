import { pgTable, text, timestamp, uuid, pgEnum } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { events } from './events'
import { users } from './users'

export const invitationStatusEnum = pgEnum('invitation_status', ['pending', 'accepted', 'declined', 'expired'])

// Track RSVP invitations sent by organizers
export const eventInvitations = pgTable('event_invitations', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),

  // The invited email (may or may not be an existing user)
  email: text('email').notNull(),

  // Invitee name (optional)
  name: text('name'),

  // Unique token for tracking this invitation
  inviteToken: text('invite_token').unique().notNull(),

  // Status tracking
  status: invitationStatusEnum('status').default('pending').notNull(),

  // Who sent the invitation
  invitedBy: uuid('invited_by')
    .notNull()
    .references(() => users.id),

  // Custom message from organizer
  message: text('message'),

  // Timestamps
  invitedAt: timestamp('invited_at', { withTimezone: true }).defaultNow().notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Relations
export const eventInvitationsRelations = relations(eventInvitations, ({ one }) => ({
  event: one(events, {
    fields: [eventInvitations.eventId],
    references: [events.id],
  }),
  inviter: one(users, {
    fields: [eventInvitations.invitedBy],
    references: [users.id],
  }),
}))

// Types
export type EventInvitation = typeof eventInvitations.$inferSelect
export type NewEventInvitation = typeof eventInvitations.$inferInsert

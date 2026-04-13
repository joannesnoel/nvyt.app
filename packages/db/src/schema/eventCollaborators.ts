import { pgTable, text, timestamp, boolean, uuid, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users'
import { events } from './events'

export const eventCollaborators = pgTable('event_collaborators', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  // userId is nullable for pending invitations to non-users
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' }),
  // Email for pending invitations (when user doesn't exist yet)
  invitedEmail: text('invited_email'),
  // Token for accepting invitation (for non-users to link after registration)
  inviteToken: text('invite_token').unique(),

  // Granular permissions
  canEdit: boolean('can_edit').default(false).notNull(),
  canPublish: boolean('can_publish').default(false).notNull(),
  canManageTickets: boolean('can_manage_tickets').default(false).notNull(),
  canCheckIn: boolean('can_check_in').default(false).notNull(),
  canManageAttendees: boolean('can_manage_attendees').default(false).notNull(),
  canViewTickets: boolean('can_view_tickets').default(false).notNull(),
  canViewAnalytics: boolean('can_view_analytics').default(true).notNull(),

  // Invitation tracking
  invitedBy: uuid('invited_by')
    .notNull()
    .references(() => users.id),
  invitedAt: timestamp('invited_at', { withTimezone: true }).defaultNow().notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Relations
export const eventCollaboratorsRelations = relations(eventCollaborators, ({ one }) => ({
  event: one(events, {
    fields: [eventCollaborators.eventId],
    references: [events.id],
  }),
  user: one(users, {
    fields: [eventCollaborators.userId],
    references: [users.id],
  }),
  inviter: one(users, {
    fields: [eventCollaborators.invitedBy],
    references: [users.id],
  }),
}))

// Types
export type EventCollaborator = typeof eventCollaborators.$inferSelect
export type NewEventCollaborator = typeof eventCollaborators.$inferInsert

// Permission type for use in APIs
export type EventPermission =
  | 'canEdit'
  | 'canPublish'
  | 'canManageTickets'
  | 'canCheckIn'
  | 'canManageAttendees'
  | 'canViewTickets'
  | 'canViewAnalytics'

export const ALL_PERMISSIONS: Record<EventPermission, boolean> = {
  canEdit: true,
  canPublish: true,
  canManageTickets: true,
  canCheckIn: true,
  canManageAttendees: true,
  canViewTickets: true,
  canViewAnalytics: true,
}

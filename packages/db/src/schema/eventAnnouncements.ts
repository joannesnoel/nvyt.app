import { pgTable, text, timestamp, uuid, boolean } from 'drizzle-orm/pg-core'
import { events } from './events'

// Event Announcements table (news/updates for events)
export const eventAnnouncements = pgTable('event_announcements', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),

  // Announcement content
  title: text('title').notNull(),
  content: text('content').notNull(),

  // Pinning and status
  isPinned: boolean('is_pinned').default(false).notNull(),
  isPublished: boolean('is_published').default(true).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Types
export type EventAnnouncement = typeof eventAnnouncements.$inferSelect
export type NewEventAnnouncement = typeof eventAnnouncements.$inferInsert

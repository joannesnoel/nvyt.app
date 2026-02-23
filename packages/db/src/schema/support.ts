import { pgTable, text, timestamp, boolean, uuid, integer, jsonb, pgEnum } from 'drizzle-orm/pg-core'
import { users } from './users'
import { events } from './events'

// Enums
export const supportConversationStatusEnum = pgEnum('support_conversation_status', [
  'open',
  'waiting_on_visitor',
  'waiting_on_support',
  'resolved',
  'closed',
])

export const supportMessageSenderTypeEnum = pgEnum('support_message_sender_type', [
  'visitor',
  'admin',
  'organizer',
  'system',
])

// Tables
export const supportConversations = pgTable('support_conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  visitorToken: text('visitor_token').notNull().unique(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  visitorName: text('visitor_name').notNull(),
  visitorEmail: text('visitor_email'),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
  status: supportConversationStatusEnum('status').notNull().default('open'),
  assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  subject: text('subject'),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  lastMessagePreview: text('last_message_preview'),
  unreadByVisitor: integer('unread_by_visitor').notNull().default(0),
  unreadBySupport: integer('unread_by_support').notNull().default(0),
  visitorOnline: boolean('visitor_online').notNull().default(false),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const supportMessages = pgTable('support_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => supportConversations.id, { onDelete: 'cascade' }),
  senderType: supportMessageSenderTypeEnum('sender_type').notNull(),
  senderId: uuid('sender_id').references(() => users.id, { onDelete: 'set null' }),
  senderName: text('sender_name').notNull(),
  content: text('content'),
  attachments: jsonb('attachments'),
  readByVisitor: boolean('read_by_visitor').notNull().default(false),
  readBySupport: boolean('read_by_support').notNull().default(false),
  emailNotificationSent: boolean('email_notification_sent').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// Types
export type SupportConversation = typeof supportConversations.$inferSelect
export type NewSupportConversation = typeof supportConversations.$inferInsert
export type SupportMessage = typeof supportMessages.$inferSelect
export type NewSupportMessage = typeof supportMessages.$inferInsert

export type SupportConversationStatus = 'open' | 'waiting_on_visitor' | 'waiting_on_support' | 'resolved' | 'closed'
export type SupportMessageSenderType = 'visitor' | 'admin' | 'organizer' | 'system'

export interface SupportAttachment {
  url: string
  key: string
  filename: string
  contentType: string
  size: number
}

import { pgTable, text, timestamp, boolean, uuid, integer, jsonb, pgEnum } from 'drizzle-orm/pg-core'
import { users } from './users'

// Enums
export const eventVisibilityEnum = pgEnum('event_visibility', ['public', 'private'])
export const eventStatusEnum = pgEnum('event_status', ['draft', 'published', 'cancelled', 'completed'])
// Registration modes:
// - 'rsvp': Free events with optional approval/waitlist (small gatherings, meetups)
// - 'tickets': Registration required via tickets, free or paid (conferences, workshops, large events)
// - 'open': No registration needed, just show up (casual public events)
export const registrationModeEnum = pgEnum('registration_mode', ['rsvp', 'tickets', 'open'])
export const eventMediaTypeEnum = pgEnum('event_media_type', ['image', 'video'])

export const events = pgTable('events', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizerId: uuid('organizer_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Basic info
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  coverImage: text('cover_image'),
  promoVideoUrl: text('promo_video_url'), // YouTube video URL for promo video embed
  mediaType: eventMediaTypeEnum('media_type').default('image').notNull(), // Which media to display: 'image' or 'video'
  organizationName: text('organization_name'), // Optional: override "Organized by" display

  // Date & Location
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }),
  timezone: text('timezone').default('Asia/Manila').notNull(),
  location: text('location'),
  locationDetails: jsonb('location_details'), // { type: 'physical' | 'online', address, coordinates, meetingUrl }

  // Visibility & Status
  visibility: eventVisibilityEnum('visibility').default('public').notNull(),
  status: eventStatusEnum('status').default('draft').notNull(),

  // Registration mode: 'rsvp' | 'tickets' | 'open'
  registrationMode: registrationModeEnum('registration_mode').default('rsvp').notNull(),

  // Capacity (applies to rsvp and tickets modes)
  maxAttendees: integer('max_attendees'), // null = unlimited
  requiresApproval: boolean('requires_approval').default(false).notNull(), // Only for rsvp mode

  // Features
  ticketingEnabled: boolean('ticketing_enabled').default(false).notNull(), // Deprecated: use registrationMode='tickets'
  contributionsEnabled: boolean('contributions_enabled').default(false).notNull(),

  // Invite-only settings
  inviteToken: text('invite_token').unique(), // For private events

  // Metadata
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Types
export type Event = typeof events.$inferSelect
export type NewEvent = typeof events.$inferInsert

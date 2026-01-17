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
// Event theme: 'light' or 'dark' - null means follow visitor's system preference
export const eventThemeEnum = pgEnum('event_theme', ['light', 'dark'])
// Event font family - typography for the event page
export const eventFontFamilyEnum = pgEnum('event_font_family', [
  // System
  'system',        // System default (Inter)
  // Display
  'oswald',        // Oswald - Bold, condensed
  'bebasnueve',    // Bebas Neue - All-caps, impactful
  'anton',         // Anton - Bold, striking
  'archivoblack',  // Archivo Black - Heavy, modern
  // Script
  'dancingscript', // Dancing Script - Casual, friendly cursive
  'greatvibes',    // Great Vibes - Elegant, formal
  'pacifico',      // Pacifico - Fun, retro
  'sacramento',    // Sacramento - Thin, elegant
  'satisfy',       // Satisfy - Casual handwriting
  'lobster',       // Lobster - Bold, retro
  // Sans-serif
  'inter',         // Inter - Clean, modern
  'roboto',        // Roboto - Popular, neutral
  'opensans',      // Open Sans - Friendly, readable
  'lato',          // Lato - Warm, humanist
  'montserrat',    // Montserrat - Geometric, modern
  'poppins',       // Poppins - Geometric, friendly
  'nunito',        // Nunito - Rounded, friendly
  'raleway',       // Raleway - Elegant, thin
  'worksans',      // Work Sans - Modern, clean
  'dmsans',        // DM Sans - Geometric, modern
  'quicksand',     // Quicksand - Rounded, playful
  // Serif
  'playfair',      // Playfair Display - Elegant serif
  'merriweather',  // Merriweather - Classic serif
  'sourceserif',   // Source Serif Pro - Professional serif
  'librebaskerville', // Libre Baskerville - Classic, readable
  'crimsontext',   // Crimson Text - Elegant, book-like
  'ebgaramond',    // EB Garamond - Classic, sophisticated
  'cormorant',     // Cormorant Garamond - Stylish, elegant
])

// Event color template - primary accent color for the event page
// Note: Database enum still contains emerald, teal, rose for backwards compatibility with existing events
export const eventColorTemplateEnum = pgEnum('event_color_template', [
  'green',   // Default - matches NuxtUI default primary
  'lime',    // Lime green
  'emerald', // Emerald (deprecated - kept for existing events)
  'teal',    // Teal (deprecated - kept for existing events)
  'cyan',    // Cyan
  'blue',    // Blue
  'indigo',  // Indigo
  'violet',  // Violet
  'purple',  // Purple
  'pink',    // Pink
  'rose',    // Rose (deprecated - kept for existing events)
  'red',     // Red
  'orange',  // Orange
  'amber',   // Amber/Gold
])

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

  // Appearance
  theme: eventThemeEnum('theme'), // null = follow visitor's system preference
  colorTemplate: eventColorTemplateEnum('color_template').default('green').notNull(), // Primary accent color
  titleFontFamily: eventFontFamilyEnum('title_font_family').default('system').notNull(), // Main title (h1) typography
  fontFamily: eventFontFamilyEnum('font_family').default('system').notNull(), // Section headings (h2-h6) typography
  bodyFontFamily: eventFontFamilyEnum('body_font_family').default('system').notNull(), // Body text typography

  // Invite-only settings
  inviteToken: text('invite_token').unique(), // For private events

  // Metadata
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Types
export type Event = typeof events.$inferSelect
export type NewEvent = typeof events.$inferInsert

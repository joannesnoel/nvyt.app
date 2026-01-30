import { z } from 'zod'

export const eventVisibility = z.enum(['public', 'private'])
export const eventStatus = z.enum(['draft', 'published', 'cancelled', 'completed'])
// Registration modes:
// - 'rsvp': Free events with optional approval/waitlist (small gatherings, meetups)
// - 'tickets': Registration required via tickets, free or paid (conferences, workshops, large events)
// - 'open': No registration needed, just show up (casual public events)
export const registrationMode = z.enum(['rsvp', 'tickets', 'open'])
export const eventMediaType = z.enum(['image', 'video'])
// Event theme: 'light' or 'dark' - null/undefined means follow visitor's system preference
export const eventTheme = z.enum(['light', 'dark'])
// Event color template - primary accent color for the event page
export const eventColorTemplate = z.enum([
  'green',   // Default - matches NuxtUI default primary
  'lime',    // Lime green
  'cyan',    // Cyan
  'blue',    // Blue
  'indigo',  // Indigo
  'violet',  // Violet
  'purple',  // Purple
  'pink',    // Pink
  'red',     // Red
  'orange',  // Orange
  'amber',   // Amber/Gold
])
// Event font family - typography for the event page
export const eventFontFamily = z.enum([
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

// Custom datetime parser that accepts both ISO 8601 and datetime-local format
const dateTimeString = z.string().refine((val) => {
  // Accept datetime-local format (2026-01-08T12:00) or ISO format (2026-01-08T12:00:00Z)
  const date = new Date(val)
  return !isNaN(date.getTime())
}, { message: 'Invalid date format' })

export const locationDetailsSchema = z.object({
  type: z.enum(['physical', 'online', 'hybrid']),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  coordinates: z.object({
    lat: z.number(),
    lng: z.number(),
  }).optional(),
  meetingUrl: z.string().url().optional(),
  meetingPassword: z.string().optional(),
})

// YouTube URL validation - accepts various YouTube URL formats (or empty string)
const youtubeUrlSchema = z.union([
  z.literal(''),
  z.string().refine((url) => {
    // Match youtube.com/watch?v=, youtu.be/, youtube.com/embed/
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/)|youtu\.be\/)[\w-]+/
    return youtubeRegex.test(url)
  }, { message: 'Please enter a valid YouTube URL' }),
]).transform(val => val || undefined)

// Base event fields (shared between create and update)
const baseEventFields = {
  title: z.string().min(3, 'Title must be at least 3 characters').max(100),
  description: z.string().max(5000).optional(),
  thumbnailImage: z.union([z.literal(''), z.string().url()]).optional().transform(val => val || null),
  coverImage: z.union([z.literal(''), z.string().url()]).optional().transform(val => val || null),
  promoVideoUrl: youtubeUrlSchema.optional(),
  mediaType: eventMediaType.default('image'),
  organizationName: z.string().max(100).optional(), // Override "Organized by" display

  // Contact & Social
  phone: z.string().min(1, 'Phone number is required'),
  email: z.string().email('Please enter a valid email'),
  website: z.union([z.literal(''), z.string().url('Please enter a valid URL')]).optional().transform(val => val || undefined),
  facebookUrl: z.string().optional(),
  instagramUrl: z.string().optional(),
  xUrl: z.string().optional(),

  startDate: dateTimeString,
  endDate: dateTimeString.optional().or(z.literal('')).transform(val => val || undefined),
  timezone: z.string().default('Asia/Manila'),

  location: z.string().optional(),
  locationDetails: locationDetailsSchema.optional(),

  visibility: eventVisibility.default('public'),
  registrationMode: registrationMode.default('rsvp'),
  maxAttendees: z.number().int().positive().optional().or(z.literal('')).transform(val => val || undefined),
  requiresApproval: z.boolean().default(false), // Only applies to 'rsvp' mode

  ticketingEnabled: z.boolean().default(false), // Deprecated: use registrationMode='tickets'
  contributionsEnabled: z.boolean().default(false),

  // Appearance - null/undefined means follow visitor's system preference
  theme: eventTheme.nullable().optional(),
  colorTemplate: eventColorTemplate.default('green'),
  titleFontFamily: eventFontFamily.default('system'), // Main title (h1) font
  fontFamily: eventFontFamily.default('system'), // Section headings (h2-h6) font
  bodyFontFamily: eventFontFamily.default('system'), // Body text font
}

export const createEventSchema = z.object(baseEventFields)

// Sex option schema for attendee sex field
const sexOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
})

// Update schema without the media refinement - validation is handled at API level
// where we can check the current event state
export const updateEventSchema = z.object({
  ...baseEventFields,
  // Registration form built-in fields
  collectAttendeeAddress: z.boolean().optional(),
  collectAttendeeSex: z.boolean().optional(),
  attendeeSexOptions: z.array(sexOptionSchema).optional(),
}).partial()

export const eventFiltersSchema = z.object({
  visibility: eventVisibility.optional(),
  status: eventStatus.optional(),
  startAfter: dateTimeString.optional(),
  startBefore: dateTimeString.optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

// Types
export type EventVisibility = z.infer<typeof eventVisibility>
export type EventStatus = z.infer<typeof eventStatus>
export type RegistrationMode = z.infer<typeof registrationMode>
export type EventMediaType = z.infer<typeof eventMediaType>
export type EventTheme = z.infer<typeof eventTheme>
export type EventColorTemplate = z.infer<typeof eventColorTemplate>
export type EventFontFamily = z.infer<typeof eventFontFamily>
export type LocationDetails = z.infer<typeof locationDetailsSchema>
export type CreateEventInput = z.infer<typeof createEventSchema>
export type UpdateEventInput = z.infer<typeof updateEventSchema>
export type EventFilters = z.infer<typeof eventFiltersSchema>

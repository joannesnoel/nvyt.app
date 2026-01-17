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
  coverImage: z.union([z.literal(''), z.string().url()]).optional().transform(val => val || undefined),
  promoVideoUrl: youtubeUrlSchema.optional(),
  mediaType: eventMediaType.default('image'),
  organizationName: z.string().max(100).optional(), // Override "Organized by" display

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
}

export const createEventSchema = z.object(baseEventFields).refine((data) => {
  // Public events require either a cover image or promo video
  if (data.visibility === 'public') {
    return !!(data.coverImage || data.promoVideoUrl)
  }
  return true
}, {
  message: 'Public events require a cover image or promo video',
  path: ['coverImage'], // Show error on the media field
})

// Update schema without the media refinement - validation is handled at API level
// where we can check the current event state
export const updateEventSchema = z.object(baseEventFields).partial()

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
export type LocationDetails = z.infer<typeof locationDetailsSchema>
export type CreateEventInput = z.infer<typeof createEventSchema>
export type UpdateEventInput = z.infer<typeof updateEventSchema>
export type EventFilters = z.infer<typeof eventFiltersSchema>

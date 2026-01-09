import { z } from 'zod'

export const eventVisibility = z.enum(['public', 'private'])
export const eventStatus = z.enum(['draft', 'published', 'cancelled', 'completed'])
// Registration modes:
// - 'rsvp': Free events with optional approval/waitlist (small gatherings, meetups)
// - 'tickets': Registration required via tickets, free or paid (conferences, workshops, large events)
// - 'open': No registration needed, just show up (casual public events)
export const registrationMode = z.enum(['rsvp', 'tickets', 'open'])

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

export const createEventSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(100),
  description: z.string().max(5000).optional(),
  coverImage: z.string().url().optional(),

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
})

export const updateEventSchema = createEventSchema.partial()

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
export type LocationDetails = z.infer<typeof locationDetailsSchema>
export type CreateEventInput = z.infer<typeof createEventSchema>
export type UpdateEventInput = z.infer<typeof updateEventSchema>
export type EventFilters = z.infer<typeof eventFiltersSchema>

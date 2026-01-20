import { pgTable, text, timestamp, uuid, integer, boolean, pgEnum, jsonb } from 'drizzle-orm/pg-core'
import { events } from './events'

// Enum for registration field type
export const registrationFieldTypeEnum = pgEnum('registration_field_type', [
  'text',
  'email',
  'phone',
  'textarea',
  'select',
  'radio',
  'checkbox',
  'date',
  'number',
  'url',
  'address',
])

// Type for field options (used by select/radio)
export type FieldOption = {
  value: string
  label: string
}

// Type for field validation rules
export type FieldValidation = {
  minLength?: number
  maxLength?: number
  pattern?: string
  min?: number
  max?: number
}

// Ticket registration fields table (organizer-defined fields for collecting attendee info after payment)
export const ticketRegistrationFields = pgTable('ticket_registration_fields', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),

  // Field configuration
  label: text('label').notNull(),
  fieldType: registrationFieldTypeEnum('field_type').notNull(),
  placeholder: text('placeholder'),
  helpText: text('help_text'),

  // Requirements
  isRequired: boolean('is_required').default(true).notNull(),

  // Options for select/radio fields
  options: jsonb('options').$type<FieldOption[]>(),

  // Validation rules
  validation: jsonb('validation').$type<FieldValidation>(),

  // Ordering and status
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Types
export type TicketRegistrationField = typeof ticketRegistrationFields.$inferSelect
export type NewTicketRegistrationField = typeof ticketRegistrationFields.$inferInsert
export type RegistrationFieldType = 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'date' | 'number' | 'url' | 'address'

// Type for address data (structured address from Google Maps)
export type AddressData = {
  formattedAddress: string
  street?: string
  barangay?: string
  city?: string
  province?: string
  region?: string
  postalCode?: string
  country?: string
  coordinates?: {
    lat: number
    lng: number
  }
}

// Type for registration data stored on tickets (fieldId → value)
export type TicketRegistrationData = Record<string, string | number | boolean | AddressData>

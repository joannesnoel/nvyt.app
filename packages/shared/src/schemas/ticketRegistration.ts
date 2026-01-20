import { z } from 'zod'

// Registration field types
export const registrationFieldType = z.enum([
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

// Address data schema (structured address from Google Maps)
export const addressDataSchema = z.object({
  formattedAddress: z.string(),
  street: z.string().optional(),
  barangay: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  region: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  coordinates: z.object({
    lat: z.number(),
    lng: z.number(),
  }).optional(),
})

// Field option schema (for select/radio fields)
export const fieldOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
})

// Field validation schema
export const fieldValidationSchema = z.object({
  minLength: z.number().int().min(0).optional(),
  maxLength: z.number().int().min(1).optional(),
  pattern: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
})

// Create registration field schema
export const createRegistrationFieldSchema = z.object({
  eventId: z.string().uuid(),
  label: z.string().min(1).max(200),
  fieldType: registrationFieldType,
  placeholder: z.string().max(200).optional(),
  helpText: z.string().max(500).optional(),
  isRequired: z.boolean().default(true),
  options: z.array(fieldOptionSchema).optional(),
  validation: fieldValidationSchema.optional(),
})

// Update registration field schema
export const updateRegistrationFieldSchema = createRegistrationFieldSchema
  .partial()
  .omit({ eventId: true })
  .extend({
    isActive: z.boolean().optional(),
  })

// Reorder registration fields schema
export const reorderRegistrationFieldsSchema = z.object({
  fieldIds: z.array(z.string().uuid()),
})

// Submit ticket registration schema
export const submitTicketRegistrationSchema = z.object({
  ticketId: z.string().uuid(),
  responses: z.record(z.string().uuid(), z.union([z.string(), z.number(), z.boolean(), addressDataSchema])),
  // Optional: pre-fill from user profile
  useUserProfile: z.boolean().optional(),
})

// Registration response value (can be string, number, boolean, or address data)
export const registrationResponseValue = z.union([z.string(), z.number(), z.boolean(), addressDataSchema])

// Types
export type RegistrationFieldType = z.infer<typeof registrationFieldType>
export type AddressData = z.infer<typeof addressDataSchema>
export type FieldOption = z.infer<typeof fieldOptionSchema>
export type FieldValidation = z.infer<typeof fieldValidationSchema>
export type CreateRegistrationFieldInput = z.infer<typeof createRegistrationFieldSchema>
export type UpdateRegistrationFieldInput = z.infer<typeof updateRegistrationFieldSchema>
export type SubmitTicketRegistrationInput = z.infer<typeof submitTicketRegistrationSchema>

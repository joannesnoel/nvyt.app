import { pgTable, text, timestamp, uuid, pgEnum, jsonb, decimal } from 'drizzle-orm/pg-core'
import { events } from './events'
import { users } from './users'

// Verification status enum
export const verificationStatusEnum = pgEnum('verification_status', [
  'not_required', // Free events don't need verification
  'draft', // Business info saved, documents not yet submitted
  'pending', // Documents submitted, awaiting review
  'under_review', // Admin is reviewing
  'approved', // Verified, can publish
  'rejected', // Rejected, needs resubmission
])

// Document types enum - covers various countries
export const documentTypeEnum = pgEnum('document_type', [
  // Philippines
  'ph_dti', // DTI Certificate (Sole Proprietor)
  'ph_sec', // SEC Registration (Corporation/Partnership)
  'ph_bir', // BIR Certificate of Registration

  // USA
  'us_ein', // EIN Letter from IRS
  'us_state_license', // State Business License
  'us_articles', // Articles of Incorporation

  // EU/UK
  'eu_vat', // VAT Registration Certificate
  'eu_company_reg', // Company Registration Document

  // Singapore
  'sg_acra', // ACRA Business Profile
  'sg_uen', // UEN Certificate

  // UAE
  'ae_trade_license', // Trade License
  'ae_moa', // Memorandum of Association

  // Generic
  'business_registration', // Generic business registration
  'government_id', // Government-issued ID of owner
  'other', // Other supporting documents
])

// Country codes that require specific documents
export const COUNTRY_DOCUMENT_REQUIREMENTS: Record<
  string,
  { required: string[]; optional: string[]; description: string }
> = {
  PH: {
    required: ['ph_dti', 'ph_sec'], // Either DTI or SEC
    optional: ['ph_bir'],
    description: 'DTI Certificate (for sole proprietors) or SEC Registration (for corporations)',
  },
  US: {
    required: ['us_ein', 'us_state_license', 'us_articles'], // Any one of these
    optional: ['government_id'],
    description: 'EIN Letter, State Business License, or Articles of Incorporation',
  },
  GB: {
    required: ['eu_company_reg'],
    optional: ['eu_vat'],
    description: 'Companies House Registration',
  },
  DE: {
    required: ['eu_company_reg'],
    optional: ['eu_vat'],
    description: 'Handelsregister (Commercial Register) extract',
  },
  FR: {
    required: ['eu_company_reg'],
    optional: ['eu_vat'],
    description: 'Extrait Kbis (Company Registration)',
  },
  SG: {
    required: ['sg_acra', 'sg_uen'], // Either one
    optional: [],
    description: 'ACRA Business Profile or UEN Certificate',
  },
  AE: {
    required: ['ae_trade_license'],
    optional: ['ae_moa'],
    description: 'Trade License from DED',
  },
  // Default for other countries
  OTHER: {
    required: ['business_registration'],
    optional: ['government_id', 'other'],
    description: 'Government-issued business registration document',
  },
}

// Event verification table - tracks verification status per event
export const eventVerifications = pgTable('event_verifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id')
    .notNull()
    .unique()
    .references(() => events.id, { onDelete: 'cascade' }),

  // Status
  status: verificationStatusEnum('status').default('pending').notNull(),

  // Country of business (ISO 3166-1 alpha-2)
  country: text('country').notNull(),

  // Business information
  businessName: text('business_name').notNull(),
  businessType: text('business_type'), // sole_proprietor, corporation, partnership, etc.
  registrationNumber: text('registration_number'), // DTI/SEC/EIN number

  // Review
  reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNotes: text('review_notes'), // Admin notes (internal)
  rejectionReason: text('rejection_reason'), // Reason shown to organizer

  // Fee configuration (set by admin during approval)
  adminFeeRate: decimal('admin_fee_rate', { precision: 5, scale: 4 }).default('0'), // e.g., 0.02 = 2%

  // Timestamps
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Verification documents table - stores uploaded documents
export const verificationDocuments = pgTable('verification_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  verificationId: uuid('verification_id')
    .notNull()
    .references(() => eventVerifications.id, { onDelete: 'cascade' }),

  // Document info
  documentType: documentTypeEnum('document_type').notNull(),
  fileName: text('file_name').notNull(),
  fileUrl: text('file_url').notNull(), // S3 URL
  fileSize: text('file_size'), // in bytes
  mimeType: text('mime_type'), // application/pdf, image/jpeg, etc.

  // Metadata (extracted or provided)
  metadata: jsonb('metadata'), // { expiryDate, issueDate, documentNumber, etc. }

  // Upload info
  uploadedBy: uuid('uploaded_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
})

// Types
export type EventVerification = typeof eventVerifications.$inferSelect
export type NewEventVerification = typeof eventVerifications.$inferInsert
export type VerificationDocument = typeof verificationDocuments.$inferSelect
export type NewVerificationDocument = typeof verificationDocuments.$inferInsert

// Helper type for document requirements
export type DocumentRequirement = {
  required: string[]
  optional: string[]
  description: string
}

// Get document requirements for a country
export function getDocumentRequirements(countryCode: string): DocumentRequirement {
  const requirements = COUNTRY_DOCUMENT_REQUIREMENTS[countryCode as keyof typeof COUNTRY_DOCUMENT_REQUIREMENTS]
  if (requirements) {
    return requirements
  }
  return COUNTRY_DOCUMENT_REQUIREMENTS.OTHER as DocumentRequirement
}

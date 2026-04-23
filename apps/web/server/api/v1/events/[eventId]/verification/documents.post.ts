// Upload verification document for an event
import { eq } from 'drizzle-orm'
import { eventVerifications, verificationDocuments } from '@nvyt/db'
import { uploadFile, isStorageConfigured } from '~/server/utils/storage'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB for documents
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]

// Valid document types
const VALID_DOCUMENT_TYPES = [
  'ph_dti',
  'ph_sec',
  'ph_bir',
  'us_ein',
  'us_state_license',
  'us_articles',
  'eu_vat',
  'eu_company_reg',
  'sg_acra',
  'sg_uen',
  'ae_trade_license',
  'ae_moa',
  'business_registration',
  'government_id',
  'other',
  'signed_service_agreement',
] as const

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  // Require access to the event (owner or collaborator with canEdit)
  const { user } = await requireEventAccess(event, eventId, 'canEdit')

  // Check if storage is configured
  if (!isStorageConfigured()) {
    throw createError({
      statusCode: 503,
      message: 'File storage is not configured',
    })
  }

  const db = useDatabase()

  // Get verification record
  const [verification] = await db
    .select()
    .from(eventVerifications)
    .where(eq(eventVerifications.eventId, eventId))
    .limit(1)

  if (!verification) {
    throw createError({
      statusCode: 400,
      message: 'Please submit verification details before uploading documents',
    })
  }

  // Don't allow uploads for approved verifications
  if (verification.status === 'approved') {
    throw createError({
      statusCode: 400,
      message: 'This event is already verified. No additional documents needed.',
    })
  }

  // Parse multipart form data
  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'No file uploaded',
    })
  }

  // Find the document file
  const documentFile = formData.find(
    (item) => item.name === 'document' || item.name === 'file'
  )
  if (!documentFile || !documentFile.data) {
    throw createError({
      statusCode: 400,
      message: 'No document file found in request',
    })
  }

  // Get document type from form data
  const documentTypeField = formData.find((item) => item.name === 'documentType')
  const documentType = documentTypeField?.data?.toString()

  if (!documentType || !VALID_DOCUMENT_TYPES.includes(documentType as typeof VALID_DOCUMENT_TYPES[number])) {
    throw createError({
      statusCode: 400,
      message: `Invalid document type. Valid types: ${VALID_DOCUMENT_TYPES.join(', ')}`,
    })
  }

  // Get content type
  const contentType = documentFile.type || 'application/octet-stream'

  // Validate file type
  if (!ALLOWED_TYPES.includes(contentType)) {
    throw createError({
      statusCode: 400,
      message: `Invalid file type: ${contentType}. Allowed types: PDF, JPEG, PNG, WebP`,
    })
  }

  // Validate file size
  if (documentFile.data.length > MAX_FILE_SIZE) {
    throw createError({
      statusCode: 400,
      message: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    })
  }

  // Upload to S3 with verification-specific folder
  const result = await uploadFile(documentFile.data, {
    filename: documentFile.filename,
    contentType,
    folder: `verification/${eventId}`,
  })

  if (!result.success) {
    throw createError({
      statusCode: 500,
      message: result.error || 'Failed to upload document',
    })
  }

  // Save document record
  const [newDocument] = await db
    .insert(verificationDocuments)
    .values({
      verificationId: verification.id,
      documentType: documentType as typeof VALID_DOCUMENT_TYPES[number],
      fileName: documentFile.filename || 'document',
      fileUrl: result.url!,
      fileSize: String(documentFile.data.length),
      mimeType: contentType,
      uploadedBy: user.id,
    })
    .returning()

  if (!newDocument) {
    throw createError({
      statusCode: 500,
      message: 'Failed to save document record',
    })
  }

  // Update verification status if it was rejected (now resubmitting)
  if (verification.status === 'rejected') {
    await db
      .update(eventVerifications)
      .set({
        status: 'pending',
        rejectionReason: null,
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(eventVerifications.id, verification.id))
  }

  return successResponse({
    message: 'Document uploaded successfully',
    document: {
      id: newDocument.id,
      documentType: newDocument.documentType,
      fileName: newDocument.fileName,
      fileUrl: newDocument.fileUrl,
      uploadedAt: newDocument.uploadedAt,
    },
  })
})

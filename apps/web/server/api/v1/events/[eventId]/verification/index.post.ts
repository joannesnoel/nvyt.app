// Submit or update verification for an event
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  events,
  eventVerifications,
  verificationDocuments,
  ticketTypes,
  getDocumentRequirements,
  COUNTRY_DOCUMENT_REQUIREMENTS,
} from '@nvyt/db'
import { sendEmail, verificationSubmittedEmail } from '~/server/utils/email'

const submitVerificationSchema = z.object({
  country: z.string().length(2, 'Country code must be 2 characters (ISO 3166-1 alpha-2)'),
  businessName: z.string().min(1, 'Business name is required').max(200),
  businessType: z.enum(['sole_proprietor', 'corporation', 'partnership', 'llc', 'other']).optional(),
  registrationNumber: z.string().max(100).optional(),
  saveOnly: z.boolean().optional(), // Just save business info, don't submit for review
  submitForReview: z.boolean().optional(), // Submit for review (requires documents)
})

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const body = await readBody(event)

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  // Require access to the event (owner or collaborator with canEdit)
  const { user } = await requireEventAccess(event, eventId, 'canEdit')

  // Validate input
  const result = submitVerificationSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const data = result.data
  const db = useDatabase()

  // Get event data
  const [eventData] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)

  if (!eventData) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  // Check if event has paid tickets (verification required)
  const paidTickets = await db
    .select()
    .from(ticketTypes)
    .where(eq(ticketTypes.eventId, eventId))

  const hasPaidTickets =
    eventData.registrationMode === 'tickets' &&
    paidTickets.some((t) => parseFloat(t.price) > 0)

  if (!hasPaidTickets) {
    throw createError({
      statusCode: 400,
      message: 'Verification is only required for events selling paid tickets',
    })
  }

  // Check if verification already exists
  const [existing] = await db
    .select()
    .from(eventVerifications)
    .where(eq(eventVerifications.eventId, eventId))
    .limit(1)

  // Get document requirements for the country
  const countryCode = data.country.toUpperCase()
  const requirements = getDocumentRequirements(countryCode)

  const { saveOnly, submitForReview } = body

  if (existing) {
    // Don't allow changes if already approved
    if (existing.status === 'approved') {
      throw createError({
        statusCode: 400,
        message: 'This event is already verified',
      })
    }

    // Don't allow changes if under review (unless resubmitting after rejection)
    if (existing.status === 'under_review') {
      throw createError({
        statusCode: 400,
        message: 'Verification is currently under review and cannot be modified',
      })
    }

    // Determine the new status
    let newStatus = existing.status
    if (submitForReview) {
      // Check if there are documents uploaded
      const documents = await db
        .select()
        .from(verificationDocuments)
        .where(eq(verificationDocuments.verificationId, existing.id))
      
      if (documents.length === 0) {
        throw createError({
          statusCode: 400,
          message: 'Please upload at least one document before submitting for review',
        })
      }
      newStatus = 'pending'
    }

    // Update existing verification
    const [updated] = await db
      .update(eventVerifications)
      .set({
        country: countryCode,
        businessName: data.businessName,
        businessType: data.businessType,
        registrationNumber: data.registrationNumber,
        status: newStatus,
        rejectionReason: submitForReview ? null : existing.rejectionReason, // Clear rejection on resubmit
        submittedAt: submitForReview ? new Date() : existing.submittedAt,
        updatedAt: new Date(),
      })
      .where(eq(eventVerifications.id, existing.id))
      .returning()

    // Send email only when submitting for review
    if (submitForReview) {
      const config = useRuntimeConfig()
      const appUrl = config.public.appUrl as string

      const emailContent = verificationSubmittedEmail({
        userName: user.name || 'there',
        eventTitle: eventData.title,
        businessName: data.businessName,
        verificationUrl: `${appUrl}/dashboard/events/${eventId}/verification`,
      })

      sendEmail({
        to: user.email,
        ...emailContent,
      }).catch((err) => {
        console.error(`[Verification] Failed to send submission email to ${user.email}:`, err)
      })
    }

    return successResponse({
      message: submitForReview 
        ? 'Verification submitted for review' 
        : 'Business information updated',
      verification: updated,
      documentRequirements: requirements,
    })
  }

  // Create new verification record as draft (not submitted for review yet)
  const [verification] = await db
    .insert(eventVerifications)
    .values({
      eventId,
      country: countryCode,
      businessName: data.businessName,
      businessType: data.businessType,
      registrationNumber: data.registrationNumber,
      status: 'draft',
    })
    .returning()

  return successResponse({
    message: 'Business information saved. Please upload the required documents.',
    verification,
    documentRequirements: requirements,
  })
})

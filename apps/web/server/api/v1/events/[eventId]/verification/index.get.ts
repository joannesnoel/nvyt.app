// Get verification status for an event
import { eq } from 'drizzle-orm'
import {
  events,
  eventVerifications,
  verificationDocuments,
  ticketTypes,
  getDocumentRequirements,
} from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  // Require access to the event (owner or collaborator with canEdit)
  await requireEventAccess(event, eventId, 'canEdit')

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

  // If no paid tickets, verification is not required
  if (!hasPaidTickets) {
    return successResponse({
      required: false,
      status: 'not_required',
      message: 'Verification is only required for events selling paid tickets',
      verification: null,
      documents: [],
    })
  }

  // Get verification record
  const [verification] = await db
    .select()
    .from(eventVerifications)
    .where(eq(eventVerifications.eventId, eventId))
    .limit(1)

  // If no verification record exists, it's pending submission
  if (!verification) {
    return successResponse({
      required: true,
      status: 'not_submitted',
      message: 'Please submit verification documents to publish this event',
      verification: null,
      documents: [],
      documentRequirements: getDocumentRequirements('OTHER'),
    })
  }

  // Get uploaded documents
  const documents = await db
    .select()
    .from(verificationDocuments)
    .where(eq(verificationDocuments.verificationId, verification.id))

  return successResponse({
    required: true,
    status: verification.status,
    message: getStatusMessage(verification.status, verification.rejectionReason),
    verification: {
      id: verification.id,
      country: verification.country,
      businessName: verification.businessName,
      businessType: verification.businessType,
      registrationNumber: verification.registrationNumber,
      submittedAt: verification.submittedAt,
      reviewedAt: verification.reviewedAt,
      rejectionReason: verification.rejectionReason,
    },
    documents: documents.map((d) => ({
      id: d.id,
      documentType: d.documentType,
      fileName: d.fileName,
      fileUrl: d.fileUrl,
      uploadedAt: d.uploadedAt,
    })),
    documentRequirements: getDocumentRequirements(verification.country),
  })
})

function getStatusMessage(
  status: string,
  rejectionReason: string | null
): string {
  switch (status) {
    case 'pending':
      return 'Your verification documents are pending review'
    case 'under_review':
      return 'Your documents are currently being reviewed by our team'
    case 'approved':
      return 'Your verification has been approved. You can now publish this event.'
    case 'rejected':
      return rejectionReason || 'Your verification was rejected. Please resubmit with valid documents.'
    default:
      return 'Unknown status'
  }
}

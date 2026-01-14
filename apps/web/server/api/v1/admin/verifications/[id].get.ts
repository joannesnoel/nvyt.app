// Get single verification details for admin review
import { eq } from 'drizzle-orm'
import { eventVerifications, verificationDocuments, events, users, ticketTypes } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Verification ID is required',
    })
  }

  // Require authentication
  const user = await requireAuth(event)

  // Check if user is admin
  requireAdmin(user.email)

  const db = useDatabase()

  // Get verification with event and organizer info
  const [verification] = await db
    .select({
      id: eventVerifications.id,
      eventId: eventVerifications.eventId,
      status: eventVerifications.status,
      country: eventVerifications.country,
      businessName: eventVerifications.businessName,
      businessType: eventVerifications.businessType,
      registrationNumber: eventVerifications.registrationNumber,
      submittedAt: eventVerifications.submittedAt,
      reviewedAt: eventVerifications.reviewedAt,
      reviewedBy: eventVerifications.reviewedBy,
      reviewNotes: eventVerifications.reviewNotes,
      rejectionReason: eventVerifications.rejectionReason,
      createdAt: eventVerifications.createdAt,
      updatedAt: eventVerifications.updatedAt,
      // Event info
      eventTitle: events.title,
      eventSlug: events.slug,
      eventDescription: events.description,
      eventStartDate: events.startDate,
      eventEndDate: events.endDate,
      eventStatus: events.status,
      eventCoverImage: events.coverImage,
      // Organizer info
      organizerId: events.organizerId,
      organizerName: users.name,
      organizerEmail: users.email,
    })
    .from(eventVerifications)
    .innerJoin(events, eq(eventVerifications.eventId, events.id))
    .innerJoin(users, eq(events.organizerId, users.id))
    .where(eq(eventVerifications.id, id))
    .limit(1)

  if (!verification) {
    throw createError({
      statusCode: 404,
      message: 'Verification not found',
    })
  }

  // Get uploaded documents
  const documents = await db
    .select()
    .from(verificationDocuments)
    .where(eq(verificationDocuments.verificationId, id))

  // Get ticket types to show pricing info
  const tickets = await db
    .select({
      id: ticketTypes.id,
      name: ticketTypes.name,
      price: ticketTypes.price,
      quantity: ticketTypes.quantity,
      quantitySold: ticketTypes.quantitySold,
    })
    .from(ticketTypes)
    .where(eq(ticketTypes.eventId, verification.eventId))

  // Get reviewer info if reviewed
  let reviewerInfo = null
  if (verification.reviewedBy) {
    const [reviewer] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, verification.reviewedBy))
      .limit(1)
    reviewerInfo = reviewer
  }

  return successResponse({
    verification: {
      ...verification,
      reviewer: reviewerInfo,
    },
    documents: documents.map((d) => ({
      id: d.id,
      documentType: d.documentType,
      fileName: d.fileName,
      fileUrl: d.fileUrl,
      fileSize: d.fileSize,
      mimeType: d.mimeType,
      uploadedAt: d.uploadedAt,
      metadata: d.metadata,
    })),
    tickets: tickets.map((t) => ({
      ...t,
      price: parseFloat(t.price),
    })),
  })
})

// Approve or reject an event verification (admin only)
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { eventVerifications, events, users } from '@nvyt/db'
import {
  sendEmail,
  verificationApprovedEmail,
  verificationRejectedEmail,
  verificationUnderReviewEmail,
} from '~/server/utils/email'

const updateVerificationSchema = z.object({
  action: z.enum(['approve', 'reject', 'start_review']),
  rejectionReason: z.string().max(1000).optional(),
  reviewNotes: z.string().max(2000).optional(), // Internal notes
  adminFeeRate: z.number().min(0).max(1).optional(), // Admin fee rate (0-1, e.g., 0.02 = 2%)
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

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

  // Validate input
  const result = updateVerificationSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const { action, rejectionReason, reviewNotes, adminFeeRate } = result.data
  const db = useDatabase()

  // Get verification
  const [verification] = await db
    .select()
    .from(eventVerifications)
    .where(eq(eventVerifications.id, id))
    .limit(1)

  if (!verification) {
    throw createError({
      statusCode: 404,
      message: 'Verification not found',
    })
  }

  // Validate action based on current status
  if (action === 'approve' || action === 'reject') {
    if (verification.status === 'approved') {
      throw createError({
        statusCode: 400,
        message: 'This verification is already approved',
      })
    }
  }

  if (action === 'reject' && !rejectionReason) {
    throw createError({
      statusCode: 400,
      message: 'Rejection reason is required when rejecting a verification',
    })
  }

  // Prepare update data
  let updateData: Partial<typeof eventVerifications.$inferInsert> = {
    updatedAt: new Date(),
  }

  switch (action) {
    case 'start_review':
      updateData.status = 'under_review'
      updateData.reviewedBy = user.id
      if (reviewNotes) updateData.reviewNotes = reviewNotes
      break

    case 'approve':
      updateData.status = 'approved'
      updateData.reviewedBy = user.id
      updateData.reviewedAt = new Date()
      updateData.rejectionReason = null
      if (reviewNotes) updateData.reviewNotes = reviewNotes
      // Save admin fee rate (default to 0 if not provided)
      updateData.adminFeeRate = String(adminFeeRate ?? 0)
      break

    case 'reject':
      updateData.status = 'rejected'
      updateData.reviewedBy = user.id
      updateData.reviewedAt = new Date()
      updateData.rejectionReason = rejectionReason
      if (reviewNotes) updateData.reviewNotes = reviewNotes
      break
  }

  // Update verification
  const [updated] = await db
    .update(eventVerifications)
    .set(updateData)
    .where(eq(eventVerifications.id, id))
    .returning()

  // Get event and organizer info for notification
  const [eventData] = await db
    .select({
      eventId: events.id,
      eventTitle: events.title,
      organizerId: events.organizerId,
      organizerName: users.name,
      organizerEmail: users.email,
    })
    .from(events)
    .innerJoin(users, eq(events.organizerId, users.id))
    .where(eq(events.id, verification.eventId))
    .limit(1)

  // Send email notification to organizer (async, don't block response)
  if (eventData) {
    const config = useRuntimeConfig()
    const appUrl = config.public.appUrl as string

    const emailData = {
      userName: eventData.organizerName || 'there',
      eventTitle: eventData.eventTitle,
      businessName: verification.businessName,
    }

    let emailContent: { subject: string; html: string } | null = null

    switch (action) {
      case 'start_review':
        emailContent = verificationUnderReviewEmail(emailData)
        break

      case 'approve':
        emailContent = verificationApprovedEmail({
          ...emailData,
          eventUrl: `${appUrl}/dashboard/events/${eventData.eventId}`,
        })
        break

      case 'reject':
        emailContent = verificationRejectedEmail({
          ...emailData,
          rejectionReason: rejectionReason || 'Please resubmit with valid documents.',
          verificationUrl: `${appUrl}/dashboard/events/${eventData.eventId}/verification`,
        })
        break
    }

    if (emailContent) {
      sendEmail({
        to: eventData.organizerEmail,
        ...emailContent,
      }).catch((err) => {
        console.error(`[Verification] Failed to send email to ${eventData.organizerEmail}:`, err)
      })
    }
  }

  const statusMessages = {
    start_review: 'Verification is now under review',
    approve: 'Verification approved successfully',
    reject: 'Verification rejected',
  }

  return successResponse({
    message: statusMessages[action],
    verification: updated,
    event: eventData,
  })
})

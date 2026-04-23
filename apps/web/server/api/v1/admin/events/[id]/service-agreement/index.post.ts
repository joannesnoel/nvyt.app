import { eq } from 'drizzle-orm'
import { events, users, eventVerifications, serviceAgreements } from '@nvyt/db'
import { generateServiceAgreementHtml } from '~/server/utils/serviceAgreementTemplate'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const user = await requireAuth(event)
  requireAdmin(user.email)

  const eventId = getRouterParam(event, 'id')
  if (!eventId) {
    throw createError({ statusCode: 400, message: 'Event ID is required' })
  }

  const db = useDatabase()

  // Get event with organizer
  const [eventRow] = await db
    .select({
      id: events.id,
      title: events.title,
      startDate: events.startDate,
      endDate: events.endDate,
      timezone: events.timezone,
      location: events.location,
      organizerId: events.organizerId,
      organizer: {
        name: users.name,
        email: users.email,
      },
    })
    .from(events)
    .innerJoin(users, eq(events.organizerId, users.id))
    .where(eq(events.id, eventId))
    .limit(1)

  if (!eventRow) {
    throw createError({ statusCode: 404, message: 'Event not found' })
  }

  // Get verification data (for business info and fee rate)
  const [verification] = await db
    .select()
    .from(eventVerifications)
    .where(eq(eventVerifications.eventId, eventId))
    .limit(1)

  // Require verification to be submitted (pending, under_review, or approved)
  const submittedStatuses = ['pending', 'under_review', 'approved']
  if (!verification || !submittedStatuses.includes(verification.status)) {
    throw createError({
      statusCode: 400,
      message: 'Cannot generate a service agreement until the organizer has submitted their verification documents.',
    })
  }

  // Read optional platformFee from request body
  const body = await readBody(event).catch(() => ({})) || {}
  const platformFeeInput = typeof body.platformFee === 'number' ? body.platformFee : null

  // Format event date
  const eventDate = new Date(eventRow.startDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: eventRow.timezone || 'Asia/Manila',
  })

  // Use provided platformFee, fall back to verification's adminFeeRate
  const adminFeeRate = platformFeeInput !== null
    ? platformFeeInput.toFixed(1)
    : verification.adminFeeRate
      ? (parseFloat(verification.adminFeeRate) * 100).toFixed(1)
      : '0'

  const businessTypeLabels: Record<string, string> = {
    sole_proprietor: 'Sole Proprietor',
    corporation: 'Corporation',
    partnership: 'Partnership',
    llc: 'LLC',
    other: 'Other',
  }

  const content = generateServiceAgreementHtml({
    platformName: 'NVYT',
    platformUrl: config.public.appUrl,
    organizerName: eventRow.organizer.name,
    organizerEmail: eventRow.organizer.email,
    businessName: verification.businessName,
    businessType: verification.businessType
      ? (businessTypeLabels[verification.businessType] || verification.businessType)
      : '',
    businessTypeRaw: verification.businessType || '',
    registrationNumber: verification.registrationNumber || '',
    eventTitle: eventRow.title,
    eventDate,
    eventLocation: eventRow.location || 'To be announced',
    adminFeeRate,
    paymentProcessingFee: '1.5-3.5',
    agreementDate: new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  })

  // Check for existing agreement
  const [existing] = await db
    .select()
    .from(serviceAgreements)
    .where(eq(serviceAgreements.eventId, eventId))
    .limit(1)

  let agreement
  if (existing) {
    // Update existing
    ;[agreement] = await db
      .update(serviceAgreements)
      .set({
        content,
        generatedBy: user.id,
        status: 'draft',
        updatedAt: new Date(),
      })
      .where(eq(serviceAgreements.eventId, eventId))
      .returning()
  } else {
    // Create new
    ;[agreement] = await db
      .insert(serviceAgreements)
      .values({
        eventId,
        content,
        generatedBy: user.id,
        status: 'draft',
      })
      .returning()
  }

  return successResponse(agreement)
})

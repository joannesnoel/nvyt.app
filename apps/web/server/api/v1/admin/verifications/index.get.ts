// List all event verifications for admin review
import { eq, sql, desc, and } from 'drizzle-orm'
import { eventVerifications, verificationDocuments, events, users } from '@nvyt/db'
import { z } from 'zod'

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'under_review', 'approved', 'rejected']).optional(),
})

export default defineEventHandler(async (event) => {
  // Require authentication
  const user = await requireAuth(event)

  // Check if user is admin
  requireAdmin(user.email)

  const db = useDatabase()

  // Parse query parameters
  const query = getQuery(event)
  const result = querySchema.safeParse(query)

  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Invalid query parameters',
      data: result.error.flatten(),
    })
  }

  const { page, limit, status } = result.data
  const offset = (page - 1) * limit

  // Build conditions
  const conditions = []
  if (status) {
    conditions.push(eq(eventVerifications.status, status))
  }

  // Get verifications with event and organizer info
  const verificationsList = await db
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
      reviewNotes: eventVerifications.reviewNotes,
      rejectionReason: eventVerifications.rejectionReason,
      createdAt: eventVerifications.createdAt,
      // Event info
      eventTitle: events.title,
      eventSlug: events.slug,
      eventStartDate: events.startDate,
      // Organizer info
      organizerId: events.organizerId,
      organizerName: users.name,
      organizerEmail: users.email,
    })
    .from(eventVerifications)
    .innerJoin(events, eq(eventVerifications.eventId, events.id))
    .innerJoin(users, eq(events.organizerId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(eventVerifications.submittedAt))
    .limit(limit)
    .offset(offset)

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(eventVerifications)
    .where(conditions.length > 0 ? and(...conditions) : undefined)

  const total = Number(countResult[0]?.count ?? 0)

  // Get summary stats
  const [stats] = await db
    .select({
      pendingCount: sql<number>`count(*) filter (where ${eventVerifications.status} = 'pending')`,
      underReviewCount: sql<number>`count(*) filter (where ${eventVerifications.status} = 'under_review')`,
      approvedCount: sql<number>`count(*) filter (where ${eventVerifications.status} = 'approved')`,
      rejectedCount: sql<number>`count(*) filter (where ${eventVerifications.status} = 'rejected')`,
    })
    .from(eventVerifications)

  // Fetch document counts for each verification
  const verificationIds = verificationsList.map((v) => v.id)
  let docCountMap = new Map<string, number>()
  
  if (verificationIds.length > 0) {
    const documentCounts = await db
      .select({
        verificationId: verificationDocuments.verificationId,
        count: sql<number>`count(*)`,
      })
      .from(verificationDocuments)
      .where(sql`${verificationDocuments.verificationId} IN (${sql.join(verificationIds.map(id => sql`${id}`), sql`, `)})`)
      .groupBy(verificationDocuments.verificationId)

    docCountMap = new Map(documentCounts.map((d) => [d.verificationId, Number(d.count)]))
  }

  return successResponse(
    {
      verifications: verificationsList.map((v) => ({
        ...v,
        documentCount: docCountMap.get(v.id) || 0,
      })),
      stats: {
        pending: Number(stats?.pendingCount || 0),
        underReview: Number(stats?.underReviewCount || 0),
        approved: Number(stats?.approvedCount || 0),
        rejected: Number(stats?.rejectedCount || 0),
      },
    },
    {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    }
  )
})

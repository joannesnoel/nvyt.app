import { eq, sql, desc, and, or, ilike } from 'drizzle-orm'
import { events, users, attendees, tickets, orders } from '@nvyt/db'
import { z } from 'zod'

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['draft', 'published', 'cancelled', 'completed']).optional(),
  registrationMode: z.enum(['rsvp', 'tickets', 'open']).optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  requireAdmin(user.email)

  const db = useDatabase()

  const query = getQuery(event)
  const result = querySchema.safeParse(query)

  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Invalid query parameters',
      data: result.error.flatten(),
    })
  }

  const { page, limit, search, status, registrationMode } = result.data
  const offset = (page - 1) * limit

  // Build conditions
  const conditions = []
  if (search) {
    conditions.push(
      or(
        ilike(events.title, `%${search}%`),
        ilike(users.name, `%${search}%`),
        ilike(users.email, `%${search}%`),
      )
    )
  }
  if (status) {
    conditions.push(eq(events.status, status))
  }
  if (registrationMode) {
    conditions.push(eq(events.registrationMode, registrationMode))
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  // Get events with organizer info and counts
  const eventsList = await db
    .select({
      id: events.id,
      title: events.title,
      slug: events.slug,
      thumbnailImage: events.thumbnailImage,
      status: events.status,
      registrationMode: events.registrationMode,
      visibility: events.visibility,
      startDate: events.startDate,
      location: events.location,
      maxAttendees: events.maxAttendees,
      createdAt: events.createdAt,
      organizer: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
      attendeeCount: sql<number>`(select count(*)::int from "attendees" where "attendees"."event_id" = "events"."id" and "attendees"."status" in ('confirmed', 'pending'))`,
      ticketCount: sql<number>`(select count(*)::int from "tickets" where "tickets"."event_id" = "events"."id" and "tickets"."status" in ('confirmed', 'checked_in'))`,
      orderCount: sql<number>`(select count(*)::int from "orders" where "orders"."event_id" = "events"."id" and "orders"."payment_status" = 'paid')`,
      revenue: sql<number>`(select coalesce(sum("orders"."total_amount"::numeric), 0) from "orders" where "orders"."event_id" = "events"."id" and "orders"."payment_status" = 'paid' and "orders"."payment_method" is distinct from 'external')`,
    })
    .from(events)
    .innerJoin(users, eq(events.organizerId, users.id))
    .where(whereClause)
    .orderBy(desc(events.createdAt))
    .limit(limit)
    .offset(offset)

  // Get total count for pagination
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(events)
    .innerJoin(users, eq(events.organizerId, users.id))
    .where(whereClause)

  const total = Number(countResult[0]?.count ?? 0)

  // Get unfiltered stats
  const [stats] = await db
    .select({
      totalEvents: sql<number>`count(*)`,
      published: sql<number>`count(*) filter (where ${events.status} = 'published')`,
      draft: sql<number>`count(*) filter (where ${events.status} = 'draft')`,
      cancelledCompleted: sql<number>`count(*) filter (where ${events.status} in ('cancelled', 'completed'))`,
    })
    .from(events)

  return successResponse(
    {
      events: eventsList.map((e) => ({
        ...e,
        revenue: parseFloat(String(e.revenue || 0)),
      })),
      stats: {
        total: Number(stats?.totalEvents || 0),
        published: Number(stats?.published || 0),
        draft: Number(stats?.draft || 0),
        cancelledCompleted: Number(stats?.cancelledCompleted || 0),
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

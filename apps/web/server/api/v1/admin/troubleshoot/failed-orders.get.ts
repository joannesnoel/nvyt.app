import { orders, events } from '@nvyt/db'
import { and, desc, eq, gte, ilike, isNotNull, lt, or } from 'drizzle-orm'

/**
 * List failed PayMongo orders that have a payment intent and could potentially
 * have already been paid in PayMongo (webhook race / WAF block / etc.).
 *
 * GET /api/v1/admin/troubleshoot/failed-orders?from=YYYY-MM-DD&to=YYYY-MM-DD&search=...
 *
 * search matches against order number, customer name/email, event title,
 * and paymongo_payment_intent_id (case-insensitive).
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  requireAdmin(user.email)

  const query = getQuery(event)
  const from = typeof query.from === 'string' ? query.from : undefined
  const to = typeof query.to === 'string' ? query.to : undefined
  const search = typeof query.search === 'string' ? query.search.trim() : ''

  const fromDate = from ? new Date(from + 'T00:00:00Z') : undefined
  const toDate = to ? new Date(to + 'T00:00:00Z') : undefined

  if (fromDate && Number.isNaN(fromDate.getTime())) {
    throw createError({ statusCode: 400, message: 'Invalid from date' })
  }
  if (toDate && Number.isNaN(toDate.getTime())) {
    throw createError({ statusCode: 400, message: 'Invalid to date' })
  }

  const db = useDatabase()

  const conditions = [
    eq(orders.paymentProvider, 'paymongo'),
    eq(orders.paymentStatus, 'failed'),
    isNotNull(orders.paymongoPaymentIntentId),
  ]
  if (fromDate) conditions.push(gte(orders.createdAt, fromDate))
  if (toDate) conditions.push(lt(orders.createdAt, toDate))
  if (search) {
    const s = `%${search}%`
    const searchClause = or(
      ilike(orders.orderNumber, s),
      ilike(orders.customerName, s),
      ilike(orders.customerEmail, s),
      ilike(orders.paymongoPaymentIntentId, s),
      ilike(events.title, s),
    )
    if (searchClause) conditions.push(searchClause)
  }

  const rows = await db
    .select({
      orderNumber: orders.orderNumber,
      paymentIntentId: orders.paymongoPaymentIntentId,
      totalAmount: orders.totalAmount,
      customerName: orders.customerName,
      customerEmail: orders.customerEmail,
      paymentMethod: orders.paymentMethod,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      eventTitle: events.title,
      eventSlug: events.slug,
    })
    .from(orders)
    .innerJoin(events, eq(orders.eventId, events.id))
    .where(and(...conditions))
    .orderBy(desc(orders.createdAt))
    .limit(500)

  return successResponse({
    orders: rows,
    range: { from: from ?? null, to: to ?? null },
    search: search || null,
    note: rows.length === 500 ? 'Capped at 500 — narrow date range or refine search to see more.' : null,
  })
})

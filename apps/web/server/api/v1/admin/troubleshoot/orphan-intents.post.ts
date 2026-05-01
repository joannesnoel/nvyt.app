import { orders, events } from '@nvyt/db'
import { and, desc, eq, gte, inArray, isNotNull, lt } from 'drizzle-orm'
import { z } from 'zod'
import { getPaymentIntent } from '~/server/utils/paymongo'

const bodySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  statuses: z.array(z.enum(['paid', 'failed', 'pending', 'refunded'])).optional(),
  limit: z.number().int().min(1).max(2000).optional(),
})

const RATE_LIMIT_DELAY_MS = 200

/**
 * Scan PayMongo orders in a date range and flag those whose payment_intent_id
 * does not exist on the PayMongo side (API returns 404). Read-only — never
 * mutates orders.
 *
 * POST /api/v1/admin/troubleshoot/orphan-intents
 * Body: { from?, to?, statuses?, limit? }
 *
 * Defaults: statuses=['paid','failed'], limit=500.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  requireAdmin(user.email)

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: 'Validation failed', data: parsed.error.flatten() })
  }

  const { from, to } = parsed.data
  const statuses = parsed.data.statuses ?? ['paid', 'failed']
  const limit = parsed.data.limit ?? 500

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
    inArray(orders.paymentStatus, statuses),
    isNotNull(orders.paymongoPaymentIntentId),
  ]
  if (fromDate) conditions.push(gte(orders.createdAt, fromDate))
  if (toDate) conditions.push(lt(orders.createdAt, toDate))

  const rows = await db
    .select({
      orderNumber: orders.orderNumber,
      paymentIntentId: orders.paymongoPaymentIntentId,
      paymentStatus: orders.paymentStatus,
      totalAmount: orders.totalAmount,
      customerEmail: orders.customerEmail,
      paidAt: orders.paidAt,
      createdAt: orders.createdAt,
      eventTitle: events.title,
    })
    .from(orders)
    .innerJoin(events, eq(orders.eventId, events.id))
    .where(and(...conditions))
    .orderBy(desc(orders.createdAt))
    .limit(limit)

  const orphans: Array<{
    orderNumber: string
    paymentIntentId: string
    paymentStatus: string
    totalAmount: string
    customerEmail: string
    paidAt: Date | null
    createdAt: Date
    eventTitle: string
  }> = []
  const errors: Array<{ orderNumber: string; error: string }> = []

  let checked = 0
  let okCount = 0

  for (const row of rows) {
    checked++
    try {
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS))
      await getPaymentIntent(row.paymentIntentId!)
      okCount++
    } catch (err: unknown) {
      const status = (err as { statusCode?: number })?.statusCode
      if (status === 404) {
        orphans.push({
          orderNumber: row.orderNumber,
          paymentIntentId: row.paymentIntentId!,
          paymentStatus: row.paymentStatus,
          totalAmount: row.totalAmount,
          customerEmail: row.customerEmail,
          paidAt: row.paidAt,
          createdAt: row.createdAt,
          eventTitle: row.eventTitle,
        })
      } else {
        const message = err instanceof Error ? err.message : 'Unknown error'
        errors.push({ orderNumber: row.orderNumber, error: message })
      }
    }
  }

  console.log(
    `[Troubleshoot] orphan-intents by ${user.email} — checked=${checked} ok=${okCount} ` +
      `orphans=${orphans.length} errors=${errors.length}`
  )

  return successResponse({
    range: { from: from ?? null, to: to ?? null },
    statuses,
    limit,
    scanned: rows.length,
    capped: rows.length === limit,
    summary: { ok: okCount, orphans: orphans.length, errors: errors.length },
    orphans,
    errors,
  })
})

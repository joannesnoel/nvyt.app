import { eq, and, gte, lte, desc } from 'drizzle-orm'
import { wallets, transactions, events } from '@nvyt/db'
import { z } from 'zod'
import { getOrCreateWallet } from '~/server/utils/wallet'

const querySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  eventId: z.string().uuid().optional(),
  format: z.enum(['csv']).default('csv'),
})

export default defineEventHandler(async (event) => {
  // Require authentication
  const user = await requireAuth(event)
  const userId = user.id
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

  const { startDate, endDate, eventId } = result.data

  // Get wallet
  const wallet = await getOrCreateWallet(userId)

  // Build conditions
  const conditions = [eq(transactions.walletId, wallet.id)]

  if (startDate) {
    conditions.push(gte(transactions.createdAt, new Date(startDate)))
  }

  if (endDate) {
    conditions.push(lte(transactions.createdAt, new Date(endDate)))
  }

  if (eventId) {
    conditions.push(eq(transactions.eventId, eventId))
  }

  // Get all transactions for export
  const transactionsList = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      fee: transactions.fee,
      netAmount: transactions.netAmount,
      currency: transactions.currency,
      status: transactions.status,
      description: transactions.description,
      eventId: transactions.eventId,
      eventTitle: events.title,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .leftJoin(events, eq(transactions.eventId, events.id))
    .where(and(...conditions))
    .orderBy(desc(transactions.createdAt))

  // Generate CSV
  const headers = [
    'Date',
    'Type',
    'Event',
    'Amount',
    'Fee',
    'Net Amount',
    'Currency',
    'Status',
    'Description',
    'Transaction ID',
  ]

  const rows = transactionsList.map((t) => [
    new Date(t.createdAt).toISOString(),
    t.type,
    t.eventTitle || '',
    t.amount,
    t.fee,
    t.netAmount,
    t.currency,
    t.status,
    t.description || '',
    t.id,
  ])

  // Escape CSV values
  const escapeCSV = (value: string | null | undefined) => {
    const str = String(value ?? '')
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => escapeCSV(cell)).join(',')),
  ].join('\n')

  // Generate filename
  const dateStr = new Date().toISOString().split('T')[0]
  const filename = `earnings-report-${dateStr}.csv`

  // Set response headers for download
  setHeader(event, 'Content-Type', 'text/csv')
  setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)

  return csvContent
})

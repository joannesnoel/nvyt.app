import { events, ticketTypes, eventVerifications } from '@nvyt/db'
import { eq, and, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { createPayPalOrder, toCents } from '~/server/utils/paypal'
import { calculateProcessingFees } from '~/server/utils/wallet'
import { getActivePrice } from '~/server/utils/pricing'

// Schema for initiating PayPal checkout (no customer info required)
const initiatePayPalSchema = z.object({
  eventId: z.string().uuid(),
  items: z.array(z.object({
    ticketTypeId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })).min(1),
  // Optional: if user is logged in
  userId: z.string().uuid().optional(),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const result = initiatePayPalSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const data = result.data
  const db = useDatabase()
  const config = useRuntimeConfig()

  // Get authenticated user if available
  const user = await getUserFromEvent(event)

  // Verify event exists
  const [eventRecord] = await db
    .select()
    .from(events)
    .where(eq(events.id, data.eventId))
    .limit(1)

  if (!eventRecord) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  if (eventRecord.registrationMode !== 'tickets') {
    throw createError({
      statusCode: 400,
      message: 'This event does not support ticket purchases',
    })
  }

  if (eventRecord.status === 'cancelled') {
    throw createError({
      statusCode: 400,
      message: 'This event has been cancelled',
    })
  }

  // Get admin fee rate
  const [verification] = await db
    .select({ adminFeeRate: eventVerifications.adminFeeRate })
    .from(eventVerifications)
    .where(eq(eventVerifications.eventId, data.eventId))
    .limit(1)

  const adminFeeRate = verification?.adminFeeRate ? parseFloat(verification.adminFeeRate) : 0

  // Get ticket types
  const ticketTypeIds = data.items.map((item) => item.ticketTypeId)
  const requestedTicketTypes = await db
    .select()
    .from(ticketTypes)
    .where(and(inArray(ticketTypes.id, ticketTypeIds), eq(ticketTypes.eventId, data.eventId)))

  if (requestedTicketTypes.length !== ticketTypeIds.length) {
    throw createError({
      statusCode: 400,
      message: 'One or more ticket types not found',
    })
  }

  const ticketTypeMap = new Map(requestedTicketTypes.map((tt) => [tt.id, tt]))

  // Calculate total and build line items
  let subtotal = 0
  const lineItems: Array<{
    name: string
    quantity: number
    amount: number
    currency: string
    description?: string
  }> = []

  for (const item of data.items) {
    const ticketType = ticketTypeMap.get(item.ticketTypeId)
    if (!ticketType) continue

    // Validate availability
    if (ticketType.status !== 'active') {
      throw createError({
        statusCode: 400,
        message: `Ticket type "${ticketType.name}" is not available`,
      })
    }

    // Check quantity
    if (ticketType.quantity !== null) {
      const available = ticketType.quantity - ticketType.quantitySold
      if (item.quantity > available) {
        throw createError({
          statusCode: 400,
          message: `Only ${available} tickets available for "${ticketType.name}"`,
        })
      }
    }

    // Get active price
    const activePriceInfo = await getActivePrice(ticketType.id, ticketType.price)
    const price = parseFloat(activePriceInfo.price)
    const itemTotal = price * item.quantity
    subtotal += itemTotal

    const tierSuffix = activePriceInfo.tierName ? ` (${activePriceInfo.tierName})` : ''
    lineItems.push({
      name: `${eventRecord.title} - ${ticketType.name}${tierSuffix}`,
      quantity: item.quantity,
      amount: toCents(price),
      currency: 'PHP',
      description: ticketType.description || undefined,
    })
  }

  if (subtotal === 0) {
    throw createError({
      statusCode: 400,
      message: 'PayPal cannot be used for free tickets',
    })
  }

  // Calculate fees
  const feeBreakdown = calculateProcessingFees(subtotal, adminFeeRate)

  // Add fees line item
  if (feeBreakdown.totalFees > 0) {
    lineItems.push({
      name: 'Fees',
      quantity: 1,
      amount: toCents(feeBreakdown.totalFees),
      currency: 'PHP',
      description: 'Transaction and booking fees',
    })
  }

  // Generate a temporary reference for this PayPal session
  const sessionRef = `PP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`

  const appUrl = config.public.appUrl as string

  // Create PayPal order
  const paypalOrder = await createPayPalOrder({
    lineItems,
    currency: 'PHP',
    referenceId: sessionRef,
    description: `Tickets for ${eventRecord.title}`,
    returnUrl: `${appUrl}/checkout/paypal/return?session=${sessionRef}`,
    cancelUrl: `${appUrl}/events/${eventRecord.slug}?checkout=cancelled`,
  })

  // Store session data in a cookie or return it for client storage
  // We'll use the PayPal order ID to retrieve this later
  const sessionData = {
    eventId: data.eventId,
    items: data.items,
    subtotal,
    processingFee: feeBreakdown.processingFee,
    adminFee: feeBreakdown.adminFee,
    totalFees: feeBreakdown.totalFees,
    total: feeBreakdown.total,
    userId: user?.id || null,
    paypalOrderId: paypalOrder.id,
    sessionRef,
  }

  // Store in cookie (encrypted by Nuxt)
  setCookie(event, 'paypal_session', JSON.stringify(sessionData), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 30, // 30 minutes
    path: '/',
  })

  // Get approval URL from PayPal response
  const approvalLink = paypalOrder.links.find(link => link.rel === 'payer-action')
  if (!approvalLink) {
    throw createError({
      statusCode: 500,
      message: 'Failed to get PayPal approval URL',
    })
  }

  return successResponse({
    approvalUrl: approvalLink.href,
    paypalOrderId: paypalOrder.id,
  })
})

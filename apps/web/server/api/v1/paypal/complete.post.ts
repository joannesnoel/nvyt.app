import { orders, tickets, ticketTypes, events, users, ticketRegistrationFields } from '@nvyt/db'
import { eq, and, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import {
  getPayPalOrder,
  capturePayPalOrder,
  isCaptureSuccessful,
  getCaptureId,
  getPayerEmail,
} from '~/server/utils/paypal'
import { sendEmail, paymentSuccessfulEmail, accountSetupEmail } from '~/server/utils/email'
import { processPaymentReceived } from '~/server/utils/wallet'
import { incrementTierQuantitySold, getActivePrice, validateTierAvailability } from '~/server/utils/pricing'

const completePayPalSchema = z.object({
  paypalOrderId: z.string(),
})

function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = nanoid(6).toUpperCase()
  return `NVYT-${timestamp}-${random}`
}

function generateTicketNumber(): string {
  const random = nanoid(10).toUpperCase()
  return `TKT-${random}`
}

function generateQRCode(): string {
  return nanoid(32)
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const result = completePayPalSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
    })
  }

  const { paypalOrderId } = result.data
  const db = useDatabase()
  const config = useRuntimeConfig()

  // Get session data from cookie
  const sessionCookie = getCookie(event, 'paypal_session')
  if (!sessionCookie) {
    throw createError({
      statusCode: 400,
      message: 'PayPal session expired. Please try again.',
    })
  }

  let sessionData: {
    eventId: string
    items: Array<{ ticketTypeId: string; quantity: number }>
    subtotal: number
    processingFee: number
    adminFee: number
    totalFees: number
    total: number
    userId: string | null
    paypalOrderId: string
    sessionRef: string
  }

  try {
    sessionData = JSON.parse(sessionCookie)
  } catch {
    throw createError({
      statusCode: 400,
      message: 'Invalid session data',
    })
  }

  // Verify PayPal order ID matches
  if (sessionData.paypalOrderId !== paypalOrderId) {
    throw createError({
      statusCode: 400,
      message: 'PayPal order mismatch',
    })
  }

  // Get PayPal order details to extract payer info
  const paypalOrder = await getPayPalOrder(paypalOrderId)

  if (paypalOrder.status !== 'APPROVED') {
    throw createError({
      statusCode: 400,
      message: 'PayPal order not approved',
    })
  }

  // Extract payer info from PayPal
  const payerEmail = paypalOrder.payer?.email_address
  const payerName = paypalOrder.payer?.name
    ? `${paypalOrder.payer.name.given_name || ''} ${paypalOrder.payer.name.surname || ''}`.trim()
    : null

  if (!payerEmail) {
    throw createError({
      statusCode: 400,
      message: 'Could not get payer email from PayPal',
    })
  }

  // Get event info
  const [eventRecord] = await db
    .select()
    .from(events)
    .where(eq(events.id, sessionData.eventId))
    .limit(1)

  if (!eventRecord) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  // Get or create user
  let user: typeof users.$inferSelect
  let isNewGuestUser = false
  let needsAccountSetup = false

  if (sessionData.userId) {
    // User was logged in during initiation
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, sessionData.userId))
      .limit(1)

    if (!existingUser) {
      throw createError({
        statusCode: 400,
        message: 'User not found',
      })
    }
    user = existingUser
  } else {
    // Guest checkout - find or create user by PayPal email
    const [existingAccount] = await db
      .select()
      .from(users)
      .where(eq(users.email, payerEmail.toLowerCase()))
      .limit(1)

    if (existingAccount) {
      user = existingAccount
      needsAccountSetup = !existingAccount.passwordHash
    } else {
      // Create new user with PayPal info
      const [newUser] = await db
        .insert(users)
        .values({
          name: payerName || payerEmail.split('@')[0],
          email: payerEmail.toLowerCase(),
          passwordHash: null,
          emailVerified: false,
        })
        .returning()

      if (!newUser) {
        throw createError({
          statusCode: 500,
          message: 'Failed to create user account',
        })
      }

      user = newUser
      isNewGuestUser = true
      needsAccountSetup = true
    }
  }

  // Get ticket types and validate availability
  const ticketTypeIds = sessionData.items.map((item) => item.ticketTypeId)
  const requestedTicketTypes = await db
    .select()
    .from(ticketTypes)
    .where(and(inArray(ticketTypes.id, ticketTypeIds), eq(ticketTypes.eventId, sessionData.eventId)))

  const ticketTypeMap = new Map(requestedTicketTypes.map((tt) => [tt.id, tt]))

  // Build tickets to create
  const ticketsToCreate: Array<{
    ticketTypeId: string
    eventId: string
    userId: string
    orderId: string
    ticketNumber: string
    qrCode: string
    status: 'pending' | 'confirmed'
    pricePaid: string
    priceTierName: string | null
  }> = []

  const tierUpdates: Array<{ tierId: string; quantity: number }> = []

  for (const item of sessionData.items) {
    const ticketType = ticketTypeMap.get(item.ticketTypeId)
    if (!ticketType) continue

    // Validate availability again
    if (ticketType.quantity !== null) {
      const available = ticketType.quantity - ticketType.quantitySold
      if (item.quantity > available) {
        throw createError({
          statusCode: 400,
          message: `Only ${available} tickets available for "${ticketType.name}"`,
        })
      }
    }

    // Get active price info for tier tracking
    const activePriceInfo = await getActivePrice(ticketType.id, ticketType.price)
    if (activePriceInfo.tierId) {
      tierUpdates.push({ tierId: activePriceInfo.tierId, quantity: item.quantity })
    }

    // Create tickets
    const price = parseFloat(activePriceInfo.price)
    for (let i = 0; i < item.quantity; i++) {
      ticketsToCreate.push({
        ticketTypeId: item.ticketTypeId,
        eventId: sessionData.eventId,
        userId: user.id,
        orderId: '', // Will be set after order creation
        ticketNumber: generateTicketNumber(),
        qrCode: generateQRCode(),
        status: 'pending',
        pricePaid: String(price),
        priceTierName: activePriceInfo.tierName || null,
        sortOrder: ticketsToCreate.length, // Sequential order within the order
      })
    }
  }

  // Capture the PayPal payment
  let capturedOrder
  try {
    capturedOrder = await capturePayPalOrder(paypalOrderId)
  } catch (error: any) {
    console.error('[PayPal Complete] Capture failed:', error)
    throw createError({
      statusCode: 400,
      message: error.message || 'Payment capture failed',
    })
  }

  if (!isCaptureSuccessful(capturedOrder)) {
    throw createError({
      statusCode: 400,
      message: 'Payment was not completed',
    })
  }

  const captureId = getCaptureId(capturedOrder)
  const orderNumber = generateOrderNumber()

  // Create setup token for guest users
  let setupToken: string | null = null
  if (needsAccountSetup) {
    setupToken = await createAccountSetupToken(user.id)
  }

  // Create order
  const [order] = await db
    .insert(orders)
    .values({
      eventId: sessionData.eventId,
      userId: user.id,
      orderNumber,
      subtotalAmount: String(sessionData.subtotal),
      processingFee: String(sessionData.processingFee),
      adminFee: String(sessionData.adminFee),
      totalFees: String(sessionData.totalFees),
      totalAmount: String(sessionData.total),
      currency: 'PHP',
      paypalOrderId,
      paypalCaptureId: captureId,
      paymentProvider: 'paypal',
      paymentMethod: 'paypal',
      paymentStatus: 'paid',
      paidAt: new Date(),
      customerName: payerName || user.name,
      customerEmail: payerEmail,
    })
    .returning()

  if (!order) {
    throw createError({
      statusCode: 500,
      message: 'Failed to create order',
    })
  }

  // Create tickets with order ID
  const ticketsWithOrderId = ticketsToCreate.map((ticket) => ({
    ...ticket,
    orderId: order.id,
    status: 'confirmed' as const,
  }))

  if (ticketsWithOrderId.length > 0) {
    await db.insert(tickets).values(ticketsWithOrderId)
  }

  // Update ticket type quantities
  for (const item of sessionData.items) {
    const ticketType = ticketTypeMap.get(item.ticketTypeId)
    if (ticketType) {
      await db
        .update(ticketTypes)
        .set({
          quantitySold: ticketType.quantitySold + item.quantity,
          updatedAt: new Date(),
        })
        .where(eq(ticketTypes.id, item.ticketTypeId))
    }
  }

  // Update tier quantities
  for (const { tierId, quantity } of tierUpdates) {
    await incrementTierQuantitySold(tierId, quantity)
  }

  // Clear the session cookie
  deleteCookie(event, 'paypal_session')

  // Record financial transaction
  try {
    if (eventRecord.organizerId) {
      const walletResult = await processPaymentReceived({
        userId: eventRecord.organizerId,
        orderId: order.id,
        eventId: order.eventId,
        grossAmount: sessionData.total,
        eventTitle: eventRecord.title,
      })

      console.log(
        `[PayPal Complete] Recorded transaction for organizer ${eventRecord.organizerId}: ` +
          `Gross=${sessionData.total}, Fee=${walletResult.platformFee}, Net=${walletResult.netAmount}`
      )
    }
  } catch (walletErr) {
    console.error('[PayPal Complete] Failed to record wallet transaction:', walletErr)
  }

  // Check if event has active registration fields
  const [registrationFieldCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ticketRegistrationFields)
    .where(
      and(
        eq(ticketRegistrationFields.eventId, eventRecord.id),
        eq(ticketRegistrationFields.isActive, true)
      )
    )
  const requiresRegistration = (registrationFieldCount?.count ?? 0) > 0

  // Send emails
  try {
    const appUrl = config.public.appUrl as string

    // Send account setup email for new guest users
    if (needsAccountSetup && setupToken) {
      await sendEmail({
        to: user.email,
        ...accountSetupEmail({
          userName: user.name,
          setupUrl: `${appUrl}/setup-account?token=${setupToken}`,
          orderNumber: order.orderNumber,
          eventTitle: eventRecord.title,
        }),
      })
    }

    // Send payment confirmation email
    const eventDate = new Date(eventRecord.startDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })

    const totalAmount = new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
    }).format(sessionData.total)

    // Build ticket summary (group by ticket type)
    const ticketSummaryMap = new Map<string, { ticketType: string; quantity: number }>()
    for (const t of ticketsWithOrderId) {
      const ticketType = ticketTypeMap.get(t.ticketTypeId)!
      const existing = ticketSummaryMap.get(t.ticketTypeId)
      if (existing) {
        existing.quantity++
      } else {
        ticketSummaryMap.set(t.ticketTypeId, { ticketType: ticketType.name, quantity: 1 })
      }
    }
    const ticketSummary = Array.from(ticketSummaryMap.values())

    const emailContent = paymentSuccessfulEmail({
      userName: user.name || 'there',
      eventTitle: eventRecord.title,
      eventDate,
      eventLocation: eventRecord.location || undefined,
      orderNumber: order.orderNumber,
      ticketCount: ticketsWithOrderId.length,
      ticketSummary,
      totalAmount,
      orderUrl: `${appUrl}/orders/${order.orderNumber}`,
      setupToken: needsAccountSetup ? setupToken ?? undefined : undefined,
      requiresRegistration,
    })

    await sendEmail({ to: user.email, ...emailContent })
    console.log(`[PayPal Complete] Sent payment confirmation email for order ${order.orderNumber}`)
  } catch (emailErr) {
    console.error('[PayPal Complete] Failed to send email:', emailErr)
  }

  return successResponse({
    orderNumber: order.orderNumber,
    orderId: order.id,
    setupToken: setupToken || undefined,
    message: 'Payment completed successfully',
  })
})

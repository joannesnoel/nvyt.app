import { orders, tickets, ticketTypes, events, users, type User } from '@nvyt/db'
import { purchaseTicketsSchema } from '@nvyt/shared'
import { eq, and, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { createCheckoutSession, toCentavos } from '~/server/utils/paymongo'
import { sendEmail, accountSetupEmail, ticketPurchaseConfirmationEmail } from '~/server/utils/email'

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

  // Validate input
  const result = purchaseTicketsSchema.safeParse(body)
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

  // Handle authentication - support both logged in users and guests
  let user: User
  let isNewGuestUser = false
  let needsAccountSetup = false

  // Try to get authenticated user first
  const existingUser = await getUserFromEvent(event)

  if (existingUser) {
    // User is logged in
    user = existingUser
  } else if (data.isGuest) {
    // Guest checkout - find or create user
    const [existingAccount] = await db
      .select()
      .from(users)
      .where(eq(users.email, data.customerEmail.toLowerCase()))
      .limit(1)

    if (existingAccount) {
      if (existingAccount.passwordHash) {
        // Account exists with password - prompt to login
        throw createError({
          statusCode: 409,
          message: 'An account with this email already exists. Please log in to continue.',
          data: { code: 'ACCOUNT_EXISTS_WITH_PASSWORD' },
        })
      }
      // Account exists without password - use it
      user = existingAccount
      needsAccountSetup = true
    } else {
      // Create new guest user
      const [newUser] = await db
        .insert(users)
        .values({
          name: data.customerName,
          email: data.customerEmail.toLowerCase(),
          passwordHash: null,
          emailVerified: false,
        })
        .returning()

      if (!newUser) {
        throw createError({
          statusCode: 500,
          message: 'Failed to create account',
        })
      }

      user = newUser
      isNewGuestUser = true
      needsAccountSetup = true
    }
  } else {
    // Not logged in and not guest checkout
    throw createError({
      statusCode: 401,
      message: 'You must be logged in or use guest checkout',
    })
  }

  // Verify event exists and ticketing is enabled
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

  // Check registration mode - tickets only work for 'tickets' mode
  if (eventRecord.registrationMode !== 'tickets') {
    if (eventRecord.registrationMode === 'rsvp') {
      throw createError({
        statusCode: 400,
        message: 'This event uses RSVP. Please RSVP instead of purchasing tickets.',
      })
    } else if (eventRecord.registrationMode === 'open') {
      throw createError({
        statusCode: 400,
        message: 'This is an open event. No registration or tickets required.',
      })
    }
  }

  if (eventRecord.status === 'cancelled') {
    throw createError({
      statusCode: 400,
      message: 'This event has been cancelled',
    })
  }

  // Get all requested ticket types
  const ticketTypeIds = data.items.map((item) => item.ticketTypeId)
  const requestedTicketTypes = await db
    .select()
    .from(ticketTypes)
    .where(and(inArray(ticketTypes.id, ticketTypeIds), eq(ticketTypes.eventId, data.eventId)))

  // Validate all ticket types exist and belong to this event
  if (requestedTicketTypes.length !== ticketTypeIds.length) {
    throw createError({
      statusCode: 400,
      message: 'One or more ticket types not found',
    })
  }

  // Create a map for easy lookup
  const ticketTypeMap = new Map(requestedTicketTypes.map((tt) => [tt.id, tt]))

  // Validate availability and calculate total
  let totalAmount = 0
  const lineItems: Array<{
    name: string
    quantity: number
    amount: number
    currency: string
    description?: string
  }> = []

  const ticketsToCreate: Array<{
    ticketTypeId: string
    eventId: string
    userId: string
    orderId: string
    ticketNumber: string
    qrCode: string
    attendeeName?: string
    attendeeEmail?: string
    status: 'pending' | 'confirmed'
  }> = []

  for (const item of data.items) {
    const ticketType = ticketTypeMap.get(item.ticketTypeId)
    if (!ticketType) continue

    // Check status
    if (ticketType.status !== 'active') {
      throw createError({
        statusCode: 400,
        message: `Ticket type "${ticketType.name}" is not available for purchase`,
      })
    }

    // Check sale period
    const now = new Date()
    if (ticketType.salesStart && new Date(ticketType.salesStart) > now) {
      throw createError({
        statusCode: 400,
        message: `Sales for "${ticketType.name}" have not started yet`,
      })
    }
    if (ticketType.salesEnd && new Date(ticketType.salesEnd) < now) {
      throw createError({
        statusCode: 400,
        message: `Sales for "${ticketType.name}" have ended`,
      })
    }

    // Check quantity limits
    if (item.quantity < ticketType.minPerOrder) {
      throw createError({
        statusCode: 400,
        message: `Minimum ${ticketType.minPerOrder} tickets required for "${ticketType.name}"`,
      })
    }
    if (item.quantity > ticketType.maxPerOrder) {
      throw createError({
        statusCode: 400,
        message: `Maximum ${ticketType.maxPerOrder} tickets allowed for "${ticketType.name}"`,
      })
    }

    // Check availability
    if (ticketType.quantity !== null) {
      const available = ticketType.quantity - ticketType.quantitySold
      if (item.quantity > available) {
        throw createError({
          statusCode: 400,
          message: `Only ${available} tickets available for "${ticketType.name}"`,
        })
      }
    }

    // Calculate line item total
    const price = parseFloat(ticketType.price)
    const itemTotal = price * item.quantity
    totalAmount += itemTotal

    lineItems.push({
      name: `${eventRecord.title} - ${ticketType.name}`,
      quantity: item.quantity,
      amount: toCentavos(price),
      currency: 'PHP',
      description: ticketType.description || undefined,
    })

    // Prepare tickets to create (will be created after order)
    const attendees = item.attendees || []
    for (let i = 0; i < item.quantity; i++) {
      const attendee = attendees[i]
      ticketsToCreate.push({
        ticketTypeId: item.ticketTypeId,
        eventId: data.eventId,
        userId: user.id,
        orderId: '', // Will be set after order creation
        ticketNumber: generateTicketNumber(),
        qrCode: generateQRCode(),
        attendeeName: attendee?.name,
        attendeeEmail: attendee?.email,
        status: 'pending',
      })
    }
  }

  // Check for free tickets (no payment needed)
  const isFreeOrder = totalAmount === 0

  // Generate order number
  const orderNumber = generateOrderNumber()

  // Generate setup token early for guest users (needed for success URL)
  let setupToken: string | null = null
  if (needsAccountSetup) {
    setupToken = await createAccountSetupToken(user.id)
  }

  // Create PayMongo checkout session (only for paid orders)
  let checkoutSession = null
  let checkoutUrl = null

  if (!isFreeOrder) {
    const appUrl = config.public.appUrl as string

    // Include setup token in success URL for guest users
    const successUrl = setupToken
      ? `${appUrl}/orders/${orderNumber}/success?token=${setupToken}`
      : `${appUrl}/orders/${orderNumber}/success`

    checkoutSession = await createCheckoutSession({
      lineItems,
      successUrl,
      cancelUrl: `${appUrl}/events/${eventRecord.slug}?checkout=cancelled`,
      referenceNumber: orderNumber,
      customerEmail: data.customerEmail,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      metadata: {
        eventId: data.eventId,
        userId: user.id,
        orderNumber,
      },
    })

    checkoutUrl = checkoutSession.attributes.checkout_url
  }

  // Create order in database
  const [order] = await db
    .insert(orders)
    .values({
      eventId: data.eventId,
      userId: user.id,
      orderNumber,
      totalAmount: String(totalAmount),
      currency: 'PHP',
      paymongoCheckoutSessionId: checkoutSession?.id,
      paymongoPaymentIntentId: checkoutSession?.attributes.payment_intent?.id,
      paymentStatus: isFreeOrder ? 'paid' : 'pending',
      paidAt: isFreeOrder ? new Date() : null,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      customerPhone: data.customerPhone,
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
    status: isFreeOrder ? ('confirmed' as const) : ('pending' as const),
  }))

  if (ticketsWithOrderId.length > 0) {
    await db.insert(tickets).values(ticketsWithOrderId)
  }

  // Update ticket type quantities sold
  for (const item of data.items) {
    await db
      .update(ticketTypes)
      .set({
        quantitySold: ticketTypeMap.get(item.ticketTypeId)!.quantitySold + item.quantity,
        updatedAt: new Date(),
      })
      .where(eq(ticketTypes.id, item.ticketTypeId))
  }

  // Send account setup email for guest users (reuse the token created earlier)
  if (needsAccountSetup && setupToken) {
    const appUrl = config.public.appUrl as string

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

  // For free orders, confirm immediately and send confirmation email
  if (isFreeOrder) {
    // Send ticket confirmation email
    try {
      const eventDate = new Date(eventRecord.startDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })

      const orderUrl = `${config.public.appUrl}/orders/${order.orderNumber}`

      // Get tickets with ticket type info for email
      const orderTickets = ticketsWithOrderId.map((t) => {
        const ticketType = ticketTypeMap.get(t.ticketTypeId)!
        return {
          ticketType: ticketType.name,
          attendeeName: t.attendeeName || user.name,
          qrCode: t.qrCode,
        }
      })

      const emailContent = ticketPurchaseConfirmationEmail({
        userName: user.name || 'there',
        eventTitle: eventRecord.title,
        eventDate,
        eventLocation: eventRecord.location || undefined,
        orderNumber: order.orderNumber,
        tickets: orderTickets,
        totalAmount: 'Free',
        orderUrl,
        setupToken: needsAccountSetup ? setupToken ?? undefined : undefined,
      })

      await sendEmail({ to: user.email, ...emailContent })
      console.log(`[Checkout] Sent free ticket confirmation email for order ${order.orderNumber}`)
    } catch (emailErr) {
      console.error('[Checkout] Failed to send free ticket confirmation email:', emailErr)
    }

    return successResponse({
      order,
      checkoutUrl: null,
      requiresPayment: false,
      accountSetupRequired: needsAccountSetup,
      message: needsAccountSetup
        ? 'Order confirmed! Check your email to set up your account.'
        : 'Order confirmed! Your tickets are ready.',
    })
  }

  return successResponse({
    order,
    checkoutUrl,
    requiresPayment: true,
    accountSetupRequired: needsAccountSetup,
    message: 'Redirecting to payment...',
  })
})

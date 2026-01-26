import { orders, tickets, ticketTypes, events, users, eventRequirements, ticketRegistrationFields, eventVerifications, type User } from '@nvyt/db'
import { purchaseTicketsSchema } from '@nvyt/shared'
import { eq, and, inArray, asc, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { createPaymentIntent, toCentavos, getPublicKey } from '~/server/utils/paymongo'
import { sendEmail, accountSetupEmail } from '~/server/utils/email'
import { calculateProcessingFees, type PaymentProvider } from '~/server/utils/wallet'
import { getActivePrice, validateTierAvailability, incrementTierQuantitySold, hasActiveTier } from '~/server/utils/pricing'

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

/**
 * Create a Payment Intent for custom checkout flow
 * This creates an order and payment intent without redirecting to PayMongo's hosted page
 */
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

  // Get event verification to retrieve admin fee rate (for paid events)
  const [verification] = await db
    .select({ adminFeeRate: eventVerifications.adminFeeRate })
    .from(eventVerifications)
    .where(eq(eventVerifications.eventId, data.eventId))
    .limit(1)

  const adminFeeRate = verification?.adminFeeRate ? parseFloat(verification.adminFeeRate) : 0

  // Calculate total tickets being purchased
  const totalTicketsRequested = data.items.reduce((sum, item) => sum + item.quantity, 0)

  // Check event-level capacity (maxAttendees)
  if (eventRecord.maxAttendees !== null) {
    // Count confirmed tickets for this event
    const [ticketCountResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tickets)
      .where(
        and(
          eq(tickets.eventId, data.eventId),
          eq(tickets.status, 'confirmed')
        )
      )

    const confirmedTickets = Number(ticketCountResult?.count ?? 0)
    const availableCapacity = eventRecord.maxAttendees - confirmedTickets

    if (totalTicketsRequested > availableCapacity) {
      if (availableCapacity <= 0) {
        throw createError({
          statusCode: 400,
          message: 'This event is sold out',
        })
      }
      throw createError({
        statusCode: 400,
        message: `Only ${availableCapacity} spots remaining for this event`,
      })
    }
  }

  // Validate event requirements
  const activeRequirements = await db
    .select()
    .from(eventRequirements)
    .where(
      and(
        eq(eventRequirements.eventId, data.eventId),
        eq(eventRequirements.isActive, true)
      )
    )
    .orderBy(asc(eventRequirements.sortOrder))

  if (activeRequirements.length > 0) {
    const responses = data.requirementResponses || []
    const responseMap = new Map(responses.map(r => [r.requirementId, r.response]))

    for (const req of activeRequirements) {
      const response = responseMap.get(req.id)

      if (response === undefined) {
        throw createError({
          statusCode: 400,
          message: `You must respond to all requirements: "${req.text}"`,
        })
      }

      // For checkbox type: must be true (agreed)
      if (req.type === 'checkbox' && response !== true) {
        throw createError({
          statusCode: 400,
          message: `You must agree to: "${req.text}"`,
        })
      }

      // For yes_no type: must match required answer
      if (req.type === 'yes_no' && response !== req.requiredAnswer) {
        const expectedAnswer = req.requiredAnswer ? 'Yes' : 'No'
        throw createError({
          statusCode: 400,
          message: `You must answer "${expectedAnswer}" to: "${req.text}"`,
        })
      }
    }
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
  const itemDetails: Array<{
    ticketTypeId: string
    ticketTypeName: string
    quantity: number
    unitPrice: number
    subtotal: number
    tierId?: string | null
  }> = []

  const ticketsToCreate: Array<{
    ticketTypeId: string
    eventId: string
    userId: string
    orderId: string
    ticketNumber: string
    qrCode: string
    attendeeName?: string
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

    // Check sale period - allow sales if ticket type is in sales period OR if an active tier exists
    const now = new Date()
    const ticketTypeInSalesPeriod =
      (!ticketType.salesStart || new Date(ticketType.salesStart) <= now) &&
      (!ticketType.salesEnd || new Date(ticketType.salesEnd) >= now)

    if (!ticketTypeInSalesPeriod) {
      // Check if there's an active tier that allows sales
      const hasActivePriceTier = await hasActiveTier(ticketType.id, now)
      if (!hasActivePriceTier) {
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
      }
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

    // Get active price (may be from a tier or base price)
    const activePriceInfo = await getActivePrice(ticketType.id, ticketType.price)
    const price = parseFloat(activePriceInfo.price)
    const itemTotal = price * item.quantity
    totalAmount += itemTotal

    // Validate tier availability for quantity-based tiers
    if (activePriceInfo.tierId && activePriceInfo.tierType !== 'time') {
      const availability = await validateTierAvailability(activePriceInfo.tierId, item.quantity)
      if (!availability.available) {
        throw createError({
          statusCode: 400,
          message: `Only ${availability.remaining ?? 0} tickets available at ${activePriceInfo.tierName} price for "${ticketType.name}"`,
        })
      }
    }

    // Store item details for response (this is what we show the user)
    itemDetails.push({
      ticketTypeId: item.ticketTypeId,
      ticketTypeName: ticketType.name,
      quantity: item.quantity,
      unitPrice: price,
      subtotal: itemTotal,
      tierId: activePriceInfo.tierId,
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
        status: 'pending',
        sortOrder: ticketsToCreate.length, // Sequential order within the order
      })
    }
  }

  // Check for free tickets (no payment needed)
  const isFreeOrder = totalAmount === 0

  // Free orders should not use this endpoint - redirect to success immediately
  if (isFreeOrder) {
    throw createError({
      statusCode: 400,
      message: 'Free orders should use the standard checkout endpoint',
    })
  }

  // Calculate processing fees
  const paymentProvider = 'paymongo' as PaymentProvider
  const feeBreakdown = calculateProcessingFees(totalAmount, adminFeeRate, paymentProvider)

  // Final total including fees
  const finalTotal = feeBreakdown.total

  // Generate order number
  const orderNumber = generateOrderNumber()

  // Generate setup token for guest users
  let setupToken: string | null = null
  if (needsAccountSetup) {
    setupToken = await createAccountSetupToken(user.id)
  }

  // Create PayMongo Payment Intent (single amount, no line items)
  const paymentIntent = await createPaymentIntent({
    amount: toCentavos(finalTotal),
    currency: 'PHP',
    description: `Tickets for ${eventRecord.title}`,
    metadata: {
      eventId: data.eventId,
      userId: user.id,
      orderNumber,
    },
  })

  // Create order in database
  const [order] = await db
    .insert(orders)
    .values({
      eventId: data.eventId,
      userId: user.id,
      orderNumber,
      subtotalAmount: String(totalAmount),
      processingFee: String(feeBreakdown.processingFee),
      adminFee: String(feeBreakdown.adminFee),
      totalFees: String(feeBreakdown.totalFees),
      totalAmount: String(finalTotal),
      currency: 'PHP',
      paymongoPaymentIntentId: paymentIntent.id,
      paymentProvider: paymentProvider,
      paymentStatus: 'pending',
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      customerPhone: data.customerPhone,
      requirementResponses: data.requirementResponses || null,
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
    status: 'pending' as const,
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

  // Update tier quantities sold (for quantity-based and hybrid tiers)
  for (const itemDetail of itemDetails) {
    if (itemDetail.tierId) {
      await incrementTierQuantitySold(itemDetail.tierId, itemDetail.quantity)
    }
  }

  // Check if event has active registration fields
  const [registrationFieldCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(ticketRegistrationFields)
    .where(
      and(
        eq(ticketRegistrationFields.eventId, data.eventId),
        eq(ticketRegistrationFields.isActive, true)
      )
    )
  const hasRegistrationFields = Number(registrationFieldCount?.count ?? 0) > 0

  // Send account setup email for guest users
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

  return successResponse({
    orderNumber: order.orderNumber,
    paymentIntentId: paymentIntent.id,
    clientKey: paymentIntent.attributes.client_key,
    publicKey: getPublicKey(),
    paymentMethodAllowed: paymentIntent.attributes.payment_method_allowed,
    eventTitle: eventRecord.title,
    eventSlug: eventRecord.slug,
    items: itemDetails,
    feeBreakdown: {
      subtotal: totalAmount,
      processingFee: feeBreakdown.processingFee,
      adminFee: feeBreakdown.adminFee,
      totalFees: feeBreakdown.totalFees,
      total: finalTotal,
    },
    registrationRequired: hasRegistrationFields,
    accountSetupRequired: needsAccountSetup,
    setupToken: setupToken || undefined,
  })
})

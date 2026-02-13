import { orders, tickets, ticketTypes, events, users, eventRequirements, ticketRegistrationFields, eventVerifications, discountCodes, type User } from '@nvyt/db'
import { purchaseTicketsSchema } from '@nvyt/shared'
import { eq, and, inArray, asc, sql } from 'drizzle-orm'
import { cancelPendingOrder } from '~/server/utils/orderCleanup'
import { nanoid } from 'nanoid'
import { createCheckoutSession, toCentavos } from '~/server/utils/paymongo'
import { sendEmail, accountSetupEmail, paymentSuccessfulEmail } from '~/server/utils/email'
import { calculateProcessingFees, type PaymentProvider } from '~/server/utils/wallet'
import { getActivePrice, validateTierAvailability, incrementTierQuantitySold, hasActiveTier } from '~/server/utils/pricing'
import { calculateDiscount } from '~/server/utils/discount'

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

  if (eventRecord.status === 'draft' && eventRecord.visibility === 'public') {
    throw createError({
      statusCode: 400,
      message: 'This event is not yet published',
    })
  }

  // Get event verification to retrieve admin fee rate (for paid events)
  const [verification] = await db
    .select({ adminFeeRate: eventVerifications.adminFeeRate })
    .from(eventVerifications)
    .where(eq(eventVerifications.eventId, data.eventId))
    .limit(1)

  const adminFeeRate = verification?.adminFeeRate ? parseFloat(verification.adminFeeRate) : 0

  // Cancel any existing pending orders from this user for this event
  // This prevents orphaned orders when users retry after a failed/abandoned payment
  const existingPendingOrders = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber, discountCodeId: orders.discountCodeId })
    .from(orders)
    .where(
      and(
        eq(orders.userId, user.id),
        eq(orders.eventId, data.eventId),
        eq(orders.paymentStatus, 'pending')
      )
    )

  for (const pendingOrder of existingPendingOrders) {
    await cancelPendingOrder(pendingOrder)
    console.log(`[Checkout] Cancelled stale pending order ${pendingOrder.orderNumber} for user ${user.id}`)
  }

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
  const lineItems: Array<{
    name: string
    quantity: number
    amount: number
    currency: string
    description?: string
    tierId?: string | null // Track which tier this purchase is for
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
    pricePaid?: string
    priceTierName?: string | null
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

    // Include tier name in line item if applicable
    const tierSuffix = activePriceInfo.tierName ? ` (${activePriceInfo.tierName})` : ''
    lineItems.push({
      name: `${eventRecord.title} - ${ticketType.name}${tierSuffix}`,
      quantity: item.quantity,
      amount: toCentavos(price),
      currency: 'PHP',
      description: ticketType.description || undefined,
      tierId: activePriceInfo.tierId, // Track which tier this purchase is for
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
        pricePaid: activePriceInfo.price,
        priceTierName: activePriceInfo.tierName || null,
        status: 'pending',
        sortOrder: ticketsToCreate.length, // Sequential order within the order
      })
    }
  }

  // --- Discount code handling ---
  let discountAmount = 0
  let discountCodeRecord: any = null

  if (data.discountCode) {
    const [codeRecord] = await db
      .select()
      .from(discountCodes)
      .where(and(
        eq(discountCodes.eventId, data.eventId),
        eq(discountCodes.code, data.discountCode.toUpperCase()),
      ))
      .limit(1)

    if (!codeRecord) {
      throw createError({ statusCode: 400, message: 'Invalid discount code' })
    }
    if (!codeRecord.isActive) {
      throw createError({ statusCode: 400, message: 'This discount code is no longer active' })
    }
    if (codeRecord.usageLimit !== null && codeRecord.usageCount >= codeRecord.usageLimit) {
      throw createError({ statusCode: 400, message: 'This discount code has reached its usage limit' })
    }

    // Build items for discount calculation
    const discountItems = data.items.map(item => {
      const tt = ticketTypeMap.get(item.ticketTypeId)!
      const lineItem = lineItems.find(li => li.name.includes(tt.name))
      const unitPrice = lineItem ? lineItem.amount / 100 : parseFloat(tt.price) // convert back from centavos
      return { ticketTypeId: item.ticketTypeId, quantity: item.quantity, unitPrice }
    })

    discountAmount = calculateDiscount(
      codeRecord.discountType,
      parseFloat(codeRecord.discountValue),
      discountItems,
      codeRecord.ticketTypeIds as string[] | null,
    )

    // Atomically increment usage count (race-safe)
    const [updated] = await db
      .update(discountCodes)
      .set({
        usageCount: sql`${discountCodes.usageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(discountCodes.id, codeRecord.id),
        codeRecord.usageLimit !== null
          ? sql`${discountCodes.usageCount} < ${codeRecord.usageLimit}`
          : sql`1=1`,
      ))
      .returning()

    if (!updated) {
      throw createError({ statusCode: 400, message: 'This discount code has reached its usage limit' })
    }

    discountCodeRecord = codeRecord
  }

  // Apply discount to total
  const discountedSubtotal = Math.max(0, totalAmount - discountAmount)

  // Check for free tickets (no payment needed)
  const isFreeOrder = discountedSubtotal === 0

  // Determine payment provider early (needed for fee calculation)
  const paymentProvider = (data.paymentProvider || 'paymongo') as PaymentProvider

  // Calculate processing fees on discounted subtotal
  const feeBreakdown = calculateProcessingFees(discountedSubtotal, adminFeeRate, paymentProvider)

  // Adjust line items for discount (reduce ticket amounts proportionally)
  if (discountAmount > 0 && !isFreeOrder) {
    // Distribute discount across applicable line items proportionally
    let remainingDiscount = toCentavos(discountAmount)
    for (let i = 0; i < lineItems.length && remainingDiscount > 0; i++) {
      const item = lineItems[i]
      const itemTotal = item.amount * item.quantity
      const reduction = Math.min(remainingDiscount, itemTotal)
      // Reduce per-unit amount (distribute evenly across quantity)
      const perUnitReduction = Math.floor(reduction / item.quantity)
      item.amount = item.amount - perUnitReduction
      remainingDiscount -= perUnitReduction * item.quantity
    }
  }

  // Add fees to line items for PayMongo (only for paid orders)
  if (!isFreeOrder && feeBreakdown.totalFees > 0) {
    lineItems.push({
      name: 'Fees',
      quantity: 1,
      amount: toCentavos(feeBreakdown.totalFees),
      currency: 'PHP',
      description: 'Transaction and booking fees',
    })
  }

  // Final total including fees
  const finalTotal = isFreeOrder ? 0 : feeBreakdown.total

  // Generate order number
  const orderNumber = generateOrderNumber()

  // Generate setup token early for guest users (needed for success URL)
  let setupToken: string | null = null
  if (needsAccountSetup) {
    setupToken = await createAccountSetupToken(user.id)
  }

  // Create PayMongo checkout session (only for paid orders using PayMongo)
  let checkoutSession = null
  let checkoutUrl = null

  if (!isFreeOrder && paymentProvider === 'paymongo') {
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
      subtotalAmount: String(totalAmount),
      processingFee: String(feeBreakdown.processingFee),
      adminFee: String(feeBreakdown.adminFee),
      totalFees: String(feeBreakdown.totalFees),
      totalAmount: String(finalTotal),
      currency: 'PHP',
      // Discount fields
      discountCodeId: discountCodeRecord?.id ?? null,
      discountCode: discountCodeRecord?.code ?? null,
      discountType: discountCodeRecord?.discountType ?? null,
      discountValue: discountCodeRecord ? discountCodeRecord.discountValue : null,
      discountAmount: String(discountAmount),
      paymongoCheckoutSessionId: checkoutSession?.id,
      paymongoPaymentIntentId: checkoutSession?.attributes.payment_intent?.id,
      paymentProvider: paymentProvider,
      paymentStatus: isFreeOrder ? 'paid' : 'pending',
      paidAt: isFreeOrder ? new Date() : null,
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
        quantitySold: sql`${ticketTypes.quantitySold} + ${item.quantity}`,
        updatedAt: new Date(),
      })
      .where(eq(ticketTypes.id, item.ticketTypeId))
  }

  // Update tier quantities sold (for quantity-based and hybrid tiers)
  for (const lineItem of lineItems) {
    if (lineItem.tierId) {
      await incrementTierQuantitySold(lineItem.tierId, lineItem.quantity)
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
        totalAmount: 'Free',
        orderUrl,
        setupToken: needsAccountSetup ? setupToken ?? undefined : undefined,
        requiresRegistration: hasRegistrationFields,
      })

      await sendEmail({ to: user.email, ...emailContent })
      console.log(`[Checkout] Sent free ticket confirmation email for order ${order.orderNumber}`)
    } catch (emailErr) {
      console.error('[Checkout] Failed to send free ticket confirmation email:', emailErr)
    }

    return successResponse({
      order,
      checkoutUrl: null,
      paymentProvider: null,
      requiresPayment: false,
      registrationRequired: hasRegistrationFields,
      accountSetupRequired: needsAccountSetup,
      setupToken: setupToken || undefined,
      message: needsAccountSetup
        ? 'Order confirmed! Check your email to set up your account.'
        : 'Order confirmed! Your tickets are ready.',
    })
  }

  // For PayPal, return order ID for frontend SDK to render buttons
  if (paymentProvider === 'paypal') {
    return successResponse({
      order,
      checkoutUrl: null,
      paymentProvider: 'paypal',
      requiresPayment: true,
      registrationRequired: hasRegistrationFields,
      accountSetupRequired: needsAccountSetup,
      setupToken: setupToken || undefined,
      message: 'Complete payment with PayPal',
    })
  }

  return successResponse({
    order,
    checkoutUrl,
    paymentProvider: 'paymongo',
    requiresPayment: true,
    registrationRequired: hasRegistrationFields,
    accountSetupRequired: needsAccountSetup,
    message: 'Redirecting to payment...',
  })
})

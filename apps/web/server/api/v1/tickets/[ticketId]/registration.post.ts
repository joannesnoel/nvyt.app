import { tickets, ticketTypes, events, orders, ticketRegistrationFields, users } from '@nvyt/db'
import { submitTicketRegistrationSchema, type AddressData } from '@nvyt/shared'
import { eq, and, asc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const ticketId = getRouterParam(event, 'ticketId')
  const body = await readBody(event)
  const setupToken = getQuery(event).token as string | undefined

  if (!ticketId) {
    throw createError({
      statusCode: 400,
      message: 'Ticket ID is required',
    })
  }

  const db = useDatabase()

  // Try to get authenticated user or verify setup token
  let userId: string | null = null
  const user = await getUserFromEvent(event)

  if (user) {
    userId = user.id
  } else if (setupToken) {
    // Verify setup token for guest access
    const tokenStatus = await verifyAccountSetupToken(setupToken)
    if (tokenStatus.valid) {
      userId = tokenStatus.userId
    }
  }

  if (!userId) {
    throw createError({
      statusCode: 401,
      message: 'Authentication required',
    })
  }

  // Validate input
  const result = submitTicketRegistrationSchema.safeParse({ ...body, ticketId })
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const { responses, useUserProfile } = result.data

  // Get ticket with order and event info
  const [ticketResult] = await db
    .select({
      ticket: tickets,
      ticketType: ticketTypes,
      event: events,
      order: orders,
    })
    .from(tickets)
    .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
    .innerJoin(events, eq(tickets.eventId, events.id))
    .innerJoin(orders, eq(tickets.orderId, orders.id))
    .where(eq(tickets.id, ticketId))
    .limit(1)

  if (!ticketResult) {
    throw createError({
      statusCode: 404,
      message: 'Ticket not found',
    })
  }

  // Verify ownership
  if (ticketResult.ticket.userId !== userId) {
    throw createError({
      statusCode: 403,
      message: 'You are not authorized to register this ticket',
    })
  }

  // Verify order is paid
  if (ticketResult.order.paymentStatus !== 'paid') {
    throw createError({
      statusCode: 400,
      message: 'Payment must be completed before registration',
    })
  }

  // Check if already registered
  if (ticketResult.ticket.registrationCompleted) {
    throw createError({
      statusCode: 400,
      message: 'This ticket has already been registered',
    })
  }

  // Get active registration fields for the event
  const registrationFieldsList = await db
    .select()
    .from(ticketRegistrationFields)
    .where(
      and(
        eq(ticketRegistrationFields.eventId, ticketResult.event.id),
        eq(ticketRegistrationFields.isActive, true)
      )
    )
    .orderBy(asc(ticketRegistrationFields.sortOrder))

  // Get user profile if useUserProfile is true
  let userProfile: { name: string; email: string } | null = null
  if (useUserProfile) {
    const [profile] = await db
      .select({
        name: users.name,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    userProfile = profile || null
  }

  // Validate required fields
  const validatedResponses: Record<string, string | number | boolean | AddressData> = {}

  for (const field of registrationFieldsList) {
    const responseValue = responses[field.id]

    // Check if required field is missing
    if (field.isRequired) {
      if (responseValue === undefined || responseValue === null || responseValue === '') {
        throw createError({
          statusCode: 400,
          message: `"${field.label}" is required`,
        })
      }
    }

    // Skip validation for empty optional fields
    if (responseValue === undefined || responseValue === null || responseValue === '') {
      continue
    }

    // Type-specific validation
    switch (field.fieldType) {
      case 'email': {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (typeof responseValue !== 'string' || !emailRegex.test(responseValue)) {
          throw createError({
            statusCode: 400,
            message: `"${field.label}" must be a valid email address`,
          })
        }
        validatedResponses[field.id] = responseValue
        break
      }

      case 'phone': {
        // Basic phone validation - allows digits, spaces, dashes, parentheses, and + for country code
        const phoneRegex = /^[+]?[\d\s\-()]{7,20}$/
        if (typeof responseValue !== 'string' || !phoneRegex.test(responseValue)) {
          throw createError({
            statusCode: 400,
            message: `"${field.label}" must be a valid phone number`,
          })
        }
        validatedResponses[field.id] = responseValue
        break
      }

      case 'number': {
        const numValue = typeof responseValue === 'string' ? parseFloat(responseValue) : responseValue
        if (typeof numValue !== 'number' || isNaN(numValue)) {
          throw createError({
            statusCode: 400,
            message: `"${field.label}" must be a valid number`,
          })
        }

        // Check min/max validation
        if (field.validation) {
          if (field.validation.min !== undefined && numValue < field.validation.min) {
            throw createError({
              statusCode: 400,
              message: `"${field.label}" must be at least ${field.validation.min}`,
            })
          }
          if (field.validation.max !== undefined && numValue > field.validation.max) {
            throw createError({
              statusCode: 400,
              message: `"${field.label}" must be at most ${field.validation.max}`,
            })
          }
        }
        validatedResponses[field.id] = numValue
        break
      }

      case 'url': {
        try {
          new URL(responseValue as string)
        } catch {
          throw createError({
            statusCode: 400,
            message: `"${field.label}" must be a valid URL`,
          })
        }
        validatedResponses[field.id] = responseValue as string
        break
      }

      case 'date': {
        // Validate date format
        const dateValue = new Date(responseValue as string)
        if (isNaN(dateValue.getTime())) {
          throw createError({
            statusCode: 400,
            message: `"${field.label}" must be a valid date`,
          })
        }
        validatedResponses[field.id] = responseValue as string
        break
      }

      case 'select':
      case 'radio': {
        // Validate that the value is one of the options
        const validOptions = field.options?.map((o) => o.value) || []
        if (!validOptions.includes(responseValue as string)) {
          throw createError({
            statusCode: 400,
            message: `"${field.label}" has an invalid selection`,
          })
        }
        validatedResponses[field.id] = responseValue as string
        break
      }

      case 'checkbox': {
        // Checkbox should be a boolean
        validatedResponses[field.id] = Boolean(responseValue)
        break
      }

      case 'text':
      case 'textarea': {
        const strValue = String(responseValue)

        // Check length validation
        if (field.validation) {
          if (field.validation.minLength !== undefined && strValue.length < field.validation.minLength) {
            throw createError({
              statusCode: 400,
              message: `"${field.label}" must be at least ${field.validation.minLength} characters`,
            })
          }
          if (field.validation.maxLength !== undefined && strValue.length > field.validation.maxLength) {
            throw createError({
              statusCode: 400,
              message: `"${field.label}" must be at most ${field.validation.maxLength} characters`,
            })
          }
          if (field.validation.pattern) {
            const regex = new RegExp(field.validation.pattern)
            if (!regex.test(strValue)) {
              throw createError({
                statusCode: 400,
                message: `"${field.label}" has an invalid format`,
              })
            }
          }
        }
        validatedResponses[field.id] = strValue
        break
      }

      case 'address': {
        // Address should be an object with formattedAddress
        if (typeof responseValue !== 'object' || !responseValue || !('formattedAddress' in responseValue)) {
          throw createError({
            statusCode: 400,
            message: `"${field.label}" must be a valid address selected from the dropdown`,
          })
        }
        // Validate the address has at least a formatted address
        const addrValue = responseValue as { formattedAddress?: string }
        if (!addrValue.formattedAddress || typeof addrValue.formattedAddress !== 'string') {
          throw createError({
            statusCode: 400,
            message: `"${field.label}" must have a valid address`,
          })
        }
        validatedResponses[field.id] = responseValue
        break
      }

      default:
        validatedResponses[field.id] = responseValue
    }
  }

  // Extract attendee name and email from responses for the ticket record
  // Look for common field labels or use the first email/text fields
  let attendeeName = ticketResult.ticket.attendeeName
  let attendeeEmail = ticketResult.ticket.attendeeEmail

  // If using user profile, override with profile data
  if (useUserProfile && userProfile) {
    attendeeName = userProfile.name
    attendeeEmail = userProfile.email
  }

  // Try to find name and email from responses
  for (const field of registrationFieldsList) {
    const value = validatedResponses[field.id]
    if (!value) continue

    const labelLower = field.label.toLowerCase()

    if (!attendeeName && field.fieldType === 'text' && (labelLower.includes('name') || labelLower.includes('full name'))) {
      attendeeName = value as string
    }

    if (!attendeeEmail && field.fieldType === 'email') {
      attendeeEmail = value as string
    }
  }

  // Update ticket with registration data
  const [updatedTicket] = await db
    .update(tickets)
    .set({
      registrationData: validatedResponses,
      registrationCompleted: true,
      registrationCompletedAt: new Date(),
      attendeeName: attendeeName || ticketResult.ticket.attendeeName,
      attendeeEmail: attendeeEmail || ticketResult.ticket.attendeeEmail,
      updatedAt: new Date(),
    })
    .where(eq(tickets.id, ticketId))
    .returning()

  if (!updatedTicket) {
    throw createError({
      statusCode: 500,
      message: 'Failed to save registration data',
    })
  }

  return successResponse({
    ticket: {
      id: updatedTicket.id,
      ticketNumber: updatedTicket.ticketNumber,
      attendeeName: updatedTicket.attendeeName,
      attendeeEmail: updatedTicket.attendeeEmail,
      registrationCompleted: updatedTicket.registrationCompleted,
      registrationCompletedAt: updatedTicket.registrationCompletedAt,
    },
    message: 'Registration completed successfully',
  })
})

import { tickets, ticketTypes, events, orders, ticketRegistrationFields, users } from '@nvyt/db'
import { submitTicketRegistrationSchema, type AddressData } from '@nvyt/shared'
import { eq, and, asc } from 'drizzle-orm'
import { sendEmail, ticketRegisteredNotificationEmail, attendeeTicketEmail } from '~/server/utils/email'
import { createAccountSetupToken } from '~/server/utils/auth'

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

  const {
    responses,
    useUserProfile,
    attendeeName: submittedAttendeeName,
    attendeeEmail: submittedAttendeeEmail,
    attendeeBirthdate: submittedAttendeeBirthdate,
    attendeeAddress: submittedAttendeeAddress,
    attendeeSex: submittedAttendeeSex,
  } = result.data

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

  // Use attendee info from form submission
  const attendeeName = submittedAttendeeName
  const attendeeEmail = submittedAttendeeEmail // Optional - may be undefined
  const attendeeBirthdate = submittedAttendeeBirthdate

  // Get purchaser info
  const [purchaser] = await db
    .select({ id: users.id, name: users.name, email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!purchaser) {
    throw createError({
      statusCode: 500,
      message: 'Failed to retrieve user information',
    })
  }

  // Determine attendee user handling based on whether email is provided
  let attendeeUserId: string
  let attendeeUser: { id: string; name: string; email: string; passwordHash: string | null } | null = null

  // Check if attendee is the same as purchaser (using their profile or matching email)
  const isSameAsPurchaser = useUserProfile ||
    (attendeeEmail && purchaser.email.toLowerCase() === attendeeEmail.toLowerCase())

  // If no email provided, ticket stays under purchaser's account (guest attendee)
  const isGuestAttendee = !attendeeEmail

  if (isSameAsPurchaser) {
    // Attendee is the purchaser
    attendeeUserId = purchaser.id

    // Update purchaser's birthdate if provided and not already set
    if (attendeeBirthdate) {
      await db
        .update(users)
        .set({ birthdate: attendeeBirthdate, updatedAt: new Date() })
        .where(eq(users.id, purchaser.id))
    }
  } else if (isGuestAttendee) {
    // No email provided - ticket stays under purchaser's account
    // Attendee data (name, birthdate, etc.) is still saved on the ticket
    attendeeUserId = purchaser.id
  } else {
    // Attendee has email and is different from purchaser - find or create user
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, attendeeEmail.toLowerCase()))
      .limit(1)

    if (existingUser) {
      attendeeUserId = existingUser.id
      attendeeUser = existingUser

      // Update user's name and birthdate if not already set
      const updates: { name?: string; birthdate?: string; updatedAt: Date } = { updatedAt: new Date() }
      if (!existingUser.name && attendeeName) updates.name = attendeeName
      if (!existingUser.birthdate && attendeeBirthdate) updates.birthdate = attendeeBirthdate

      if (updates.name || updates.birthdate) {
        await db.update(users).set(updates).where(eq(users.id, existingUser.id))
      }
    } else {
      // Create new user for attendee
      const [newUser] = await db
        .insert(users)
        .values({
          email: attendeeEmail.toLowerCase(),
          name: attendeeName || '',
          birthdate: attendeeBirthdate || null,
        })
        .returning()

      if (!newUser) {
        throw createError({
          statusCode: 500,
          message: 'Failed to create attendee account',
        })
      }

      attendeeUserId = newUser.id
      attendeeUser = newUser
    }
  }

  // Merge optional built-in fields into registration data with reserved keys
  const finalRegistrationData: Record<string, string | number | boolean | AddressData> = {
    ...validatedResponses,
  }
  if (submittedAttendeeAddress) {
    finalRegistrationData._address = submittedAttendeeAddress
  }
  if (submittedAttendeeSex) {
    finalRegistrationData._sex = submittedAttendeeSex
  }

  // Update ticket with registration data and attendeeUserId
  // Note: attendeeEmail, attendeeAddress, attendeeSex columns removed
  // - Email is looked up via attendeeUserId -> users table
  // - Address and sex are stored in registrationData
  const [updatedTicket] = await db
    .update(tickets)
    .set({
      registrationData: finalRegistrationData,
      registrationCompleted: true,
      registrationCompletedAt: new Date(),
      attendeeUserId,
      attendeeName,
      attendeeBirthdate,
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

  // Get attendee email for sending ticket
  // - If attendee has their own user account, use their email
  // - If same as purchaser, use purchaser's email
  // - If guest attendee (no separate account), send to purchaser so they get the QR code
  const attendeeEmailForNotification = attendeeUser?.email || (isSameAsPurchaser || isGuestAttendee ? purchaser.email : null)

  if (attendeeEmailForNotification) {
    const config = useRuntimeConfig()
    const baseUrl = config.public?.appUrl || 'https://nvyt.app'

    // Format event date for email
    const eventDate = new Date(ticketResult.event.startDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })

    // If the email recipient has no password, include a setup token so they can view the ticket and set up their account
    // Reuse the incoming token if the recipient is the same user (creating a new one would invalidate the current token)
    const recipientUser = attendeeUser || purchaser
    const incomingToken = getQuery(event).token as string | undefined
    let emailSetupToken: string | undefined
    if (!recipientUser.passwordHash) {
      if (incomingToken && recipientUser.id === userId) {
        emailSetupToken = incomingToken
      } else {
        emailSetupToken = await createAccountSetupToken(recipientUser.id)
      }
    }

    // Send the ticket with QR code (and optional setup link) to the attendee
    const ticketUrl = `${baseUrl}/tickets/${updatedTicket.id}`
    const ticketEmailContent = attendeeTicketEmail({
      attendeeName: attendeeName || 'there',
      eventTitle: ticketResult.event.title,
      eventDate,
      eventLocation: ticketResult.event.location || undefined,
      ticketType: ticketResult.ticketType.name,
      ticketNumber: updatedTicket.ticketNumber,
      qrCode: updatedTicket.qrCode,
      ticketUrl,
      purchaserName: !isSameAsPurchaser && !isGuestAttendee ? purchaser.name : undefined,
      setupToken: emailSetupToken,
    })

    sendEmail({ to: attendeeEmailForNotification, ...ticketEmailContent })
      .catch(err => console.error('[Registration] Failed to send ticket email:', err))
  }

  return successResponse({
    ticket: {
      id: updatedTicket.id,
      ticketNumber: updatedTicket.ticketNumber,
      attendeeName: updatedTicket.attendeeName,
      registrationCompleted: updatedTicket.registrationCompleted,
      registrationCompletedAt: updatedTicket.registrationCompletedAt,
    },
    message: 'Registration completed successfully',
  })
})

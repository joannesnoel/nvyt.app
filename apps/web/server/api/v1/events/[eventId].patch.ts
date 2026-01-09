import { eq } from 'drizzle-orm'
import { events } from '@nvyt/db'
import { updateEventSchema } from '@nvyt/shared'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const eventId = getRouterParam(event, 'eventId')
  const body = await readBody(event)

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  const db = useDatabase()

  // Get existing event
  const [existingEvent] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)

  if (!existingEvent) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  // Verify ownership
  if (existingEvent.organizerId !== user.id) {
    throw createError({
      statusCode: 403,
      message: 'You can only edit your own events',
    })
  }

  // Validate input (allow status to be updated separately)
  const allowedStatusValues = ['draft', 'published', 'cancelled', 'completed'] as const
  const statusUpdate = body.status && allowedStatusValues.includes(body.status)
    ? { status: body.status as typeof allowedStatusValues[number] }
    : {}

  // Validate other fields
  const result = updateEventSchema.safeParse(body)
  
  if (!result.success && !statusUpdate.status) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const updateData: Record<string, unknown> = {
    ...statusUpdate,
    updatedAt: new Date(),
  }

  // Add validated fields if present in body (check body keys, not parsed data)
  // This ensures we update fields that were explicitly sent
  if (result.success) {
    const data = result.data
    if ('title' in body) updateData.title = data.title
    if ('description' in body) updateData.description = data.description
    if ('coverImage' in body) updateData.coverImage = data.coverImage
    if ('startDate' in body && data.startDate) updateData.startDate = new Date(data.startDate)
    if ('endDate' in body) updateData.endDate = data.endDate ? new Date(data.endDate) : null
    if ('timezone' in body) updateData.timezone = data.timezone
    if ('location' in body) updateData.location = data.location
    if ('locationDetails' in body) updateData.locationDetails = data.locationDetails
    if ('visibility' in body) updateData.visibility = data.visibility
    if ('registrationMode' in body) updateData.registrationMode = data.registrationMode
    if ('maxAttendees' in body) updateData.maxAttendees = data.maxAttendees ?? null
    if ('requiresApproval' in body) updateData.requiresApproval = data.requiresApproval
    if ('ticketingEnabled' in body) updateData.ticketingEnabled = data.ticketingEnabled
    if ('contributionsEnabled' in body) updateData.contributionsEnabled = data.contributionsEnabled
  }

  // Update event
  const [updated] = await db
    .update(events)
    .set(updateData)
    .where(eq(events.id, eventId))
    .returning()

  // TODO: If status changed to cancelled, notify all attendees

  return successResponse(updated)
})

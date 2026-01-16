import { eq, and } from 'drizzle-orm'
import { eventCollaborators, users } from '@nvyt/db'
import { updateCollaboratorSchema } from '@nvyt/shared'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const collaboratorId = getRouterParam(event, 'collaboratorId')
  const body = await readBody(event)

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  if (!collaboratorId) {
    throw createError({
      statusCode: 400,
      message: 'Collaborator ID is required',
    })
  }

  // Only owners can update collaborator permissions
  await requireEventOwner(event, eventId)

  // Validate input
  const result = updateCollaboratorSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const data = result.data
  const db = useDatabase()

  // Verify the collaborator exists and belongs to this event
  const existing = await db.query.eventCollaborators.findFirst({
    where: and(
      eq(eventCollaborators.id, collaboratorId),
      eq(eventCollaborators.eventId, eventId)
    ),
  })

  if (!existing) {
    throw createError({
      statusCode: 404,
      message: 'Collaborator not found',
    })
  }

  // Build update object with only provided fields
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  }

  if (data.canEdit !== undefined) updateData.canEdit = data.canEdit
  if (data.canPublish !== undefined) updateData.canPublish = data.canPublish
  if (data.canManageTickets !== undefined) updateData.canManageTickets = data.canManageTickets
  if (data.canCheckIn !== undefined) updateData.canCheckIn = data.canCheckIn
  if (data.canManageAttendees !== undefined) updateData.canManageAttendees = data.canManageAttendees
  if (data.canViewAnalytics !== undefined) updateData.canViewAnalytics = data.canViewAnalytics

  // Update the collaborator
  const [updated] = await db
    .update(eventCollaborators)
    .set(updateData)
    .where(eq(eventCollaborators.id, collaboratorId))
    .returning()

  if (!updated) {
    throw createError({
      statusCode: 500,
      message: 'Failed to update collaborator',
    })
  }

  // Get user details for response
  const [userDetails] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
    })
    .from(users)
    .where(eq(users.id, updated.userId!))
    .limit(1)

  return successResponse({
    ...updated,
    user: userDetails,
  })
})

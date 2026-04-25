import { H3Event } from 'h3'
import { eq, and, isNotNull } from 'drizzle-orm'
import { events, eventCollaborators, type User, type EventPermission, ALL_PERMISSIONS } from '@nvyt/db'

export interface EventPermissions {
  canEdit: boolean
  canPublish: boolean
  canManageTickets: boolean
  canCheckIn: boolean
  canManageAttendees: boolean
  canViewTickets: boolean
  canViewAnalytics: boolean
  canManageFinances: boolean
}

export interface EventAccessResult {
  user: User
  isOwner: boolean
  permissions: EventPermissions
  eventId: string
}

/**
 * Check if a user has access to an event with optional permission requirement.
 *
 * @param event - H3 event object
 * @param eventId - The event ID to check access for
 * @param permission - Optional specific permission to require
 * @returns EventAccessResult with user, ownership status, and permissions
 * @throws 401 if not authenticated
 * @throws 404 if event not found
 * @throws 403 if access denied or missing required permission
 */
export async function requireEventAccess(
  event: H3Event,
  eventId: string,
  permission?: EventPermission
): Promise<EventAccessResult> {
  // Require authentication
  const user = await requireAuth(event)

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  const db = useDatabase()

  // Get the event
  const [eventData] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)

  if (!eventData) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  // Owner always has full access
  if (eventData.organizerId === user.id) {
    return {
      user,
      isOwner: true,
      permissions: ALL_PERMISSIONS,
      eventId,
    }
  }

  // Check if user is a collaborator with accepted invitation
  const collaborator = await db.query.eventCollaborators.findFirst({
    where: and(
      eq(eventCollaborators.eventId, eventId),
      eq(eventCollaborators.userId, user.id),
      isNotNull(eventCollaborators.acceptedAt)
    ),
  })

  if (!collaborator) {
    throw createError({
      statusCode: 403,
      message: 'You do not have access to this event',
    })
  }

  const permissions: EventPermissions = {
    canEdit: collaborator.canEdit,
    canPublish: collaborator.canPublish,
    canManageTickets: collaborator.canManageTickets,
    canCheckIn: collaborator.canCheckIn,
    canManageAttendees: collaborator.canManageAttendees,
    canViewTickets: collaborator.canViewTickets,
    canViewAnalytics: collaborator.canViewAnalytics,
    canManageFinances: collaborator.canManageFinances,
  }

  // Check specific permission if required
  if (permission && !permissions[permission]) {
    throw createError({
      statusCode: 403,
      message: `You do not have permission to ${formatPermission(permission)}`,
    })
  }

  return {
    user,
    isOwner: false,
    permissions,
    eventId,
  }
}

/**
 * Check if a user has any access to an event (owner or collaborator).
 * Does not require a specific permission.
 */
export async function checkEventAccess(
  event: H3Event,
  eventId: string
): Promise<EventAccessResult | null> {
  try {
    return await requireEventAccess(event, eventId)
  } catch (error: unknown) {
    const err = error as { statusCode?: number }
    if (err.statusCode === 403) {
      return null
    }
    throw error
  }
}

/**
 * Require that the user is the owner of the event.
 * Collaborators are not allowed even with full permissions.
 */
export async function requireEventOwner(
  event: H3Event,
  eventId: string
): Promise<{ user: User; eventId: string }> {
  const result = await requireEventAccess(event, eventId)

  if (!result.isOwner) {
    throw createError({
      statusCode: 403,
      message: 'Only the event owner can perform this action',
    })
  }

  return { user: result.user, eventId: result.eventId }
}

/**
 * Format a permission name for display in error messages.
 */
function formatPermission(permission: EventPermission): string {
  const formats: Record<EventPermission, string> = {
    canEdit: 'edit this event',
    canPublish: 'publish or unpublish this event',
    canManageTickets: 'manage tickets for this event',
    canCheckIn: 'check in attendees',
    canManageAttendees: 'manage attendees',
    canViewTickets: 'view tickets',
    canViewAnalytics: 'view analytics',
    canManageFinances: 'manage finances for this event',
  }
  return formats[permission] || permission
}

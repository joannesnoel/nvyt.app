import { events } from '@nvyt/db'
import { createEventSchema } from '@nvyt/shared'
import { nanoid } from 'nanoid'

function generateSlug(title: string): string {
  const baseSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50)

  return `${baseSlug}-${nanoid(8)}`
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  // Validate input
  const result = createEventSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const data = result.data
  const db = useDatabase()

  // Generate slug and invite token (for private events)
  const slug = generateSlug(data.title)
  const inviteToken = data.visibility === 'private' ? nanoid(16) : null

  // Create event
  const [newEvent] = await db
    .insert(events)
    .values({
      organizerId: user.id,
      title: data.title,
      slug,
      description: data.description,
      coverImage: data.coverImage,
      promoVideoUrl: data.promoVideoUrl,
      mediaType: data.mediaType,
      organizationName: data.organizationName,
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : null,
      timezone: data.timezone,
      location: data.location,
      locationDetails: data.locationDetails,
      visibility: data.visibility,
      registrationMode: data.registrationMode,
      maxAttendees: data.maxAttendees,
      requiresApproval: data.requiresApproval,
      ticketingEnabled: data.ticketingEnabled ?? data.registrationMode === 'tickets',
      contributionsEnabled: data.contributionsEnabled,
      inviteToken,
      status: 'draft',
    })
    .returning()

  if (!newEvent) {
    throw createError({
      statusCode: 500,
      message: 'Failed to create event',
    })
  }

  return successResponse(newEvent)
})

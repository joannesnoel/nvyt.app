import { eq, and, inArray, isNotNull } from 'drizzle-orm'
import { events, attendees, users } from '@nvyt/db'
import { sendEmail, rsvpQrEmail } from '~/server/utils/email'

// Resend the check-in QR-code email to an event's confirmed attendees.
// Body: { attendeeIds?: string[] } — if provided, only those attendees are
// emailed; otherwise all confirmed attendees with a QR code are.
export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const config = useRuntimeConfig()

  if (!eventId) {
    throw createError({ statusCode: 400, message: 'Event ID is required' })
  }

  // Owner or collaborator with attendee-management permission
  await requireEventAccess(event, eventId, 'canManageAttendees')

  const body = await readBody(event).catch(() => ({})) as { attendeeIds?: unknown }
  const attendeeIds = Array.isArray(body?.attendeeIds)
    ? body.attendeeIds.filter((x): x is string => typeof x === 'string')
    : undefined

  const db = useDatabase()

  const [eventData] = await db
    .select({
      id: events.id,
      title: events.title,
      slug: events.slug,
      startDate: events.startDate,
      timezone: events.timezone,
      location: events.location,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)

  if (!eventData) {
    throw createError({ statusCode: 404, message: 'Event not found' })
  }

  // Confirmed attendees that have a QR code (optionally limited to attendeeIds)
  const conditions = [
    eq(attendees.eventId, eventId),
    eq(attendees.status, 'confirmed'),
    isNotNull(attendees.qrCode),
  ]
  if (attendeeIds && attendeeIds.length > 0) {
    conditions.push(inArray(attendees.id, attendeeIds))
  }

  const recipients = await db
    .select({
      qrCode: attendees.qrCode,
      name: users.name,
      email: users.email,
    })
    .from(attendees)
    .innerJoin(users, eq(attendees.userId, users.id))
    .where(and(...conditions))

  const eligible = recipients.filter(r => r.email && r.qrCode)

  if (eligible.length === 0) {
    return successResponse({
      message: 'No confirmed attendees with a QR code to email',
      sent: 0,
      failed: 0,
    })
  }

  const baseUrl = config.public?.appUrl || 'https://nvyt.app'
  const eventUrl = `${baseUrl}/events/${eventData.slug}`
  const eventDate = eventData.startDate
    ? new Date(eventData.startDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: eventData.timezone || 'Asia/Manila',
      })
    : 'TBD'

  // Send in parallel with a concurrency limit (same pattern as invite.post.ts)
  const CONCURRENCY = 10
  const results: { email: string; success: boolean }[] = []

  for (let i = 0; i < eligible.length; i += CONCURRENCY) {
    const batch = eligible.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.all(
      batch.map(async (r) => {
        const content = rsvpQrEmail({
          userName: r.name || 'there',
          eventTitle: eventData.title,
          eventDate,
          eventLocation: eventData.location || undefined,
          qrCode: r.qrCode!,
          eventUrl,
        })
        const res = await sendEmail({ to: r.email!, ...content })
        return { email: r.email!, success: res.success }
      })
    )
    results.push(...batchResults)
  }

  const sent = results.filter(r => r.success).length
  const failedEmails = results.filter(r => !r.success).map(r => r.email)

  return successResponse({
    message: `Sent QR email to ${sent} of ${eligible.length} attendee(s)`,
    sent,
    failed: failedEmails.length,
    failedEmails: failedEmails.length > 0 ? failedEmails : undefined,
  })
})

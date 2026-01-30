import { events, eventVerifications } from '@nvyt/db'
import { eq } from 'drizzle-orm'

/**
 * Unpublishes an event if it is currently published and does not have
 * approved verification. Call this whenever a paid price is introduced
 * (ticket type create/update, price tier create/update).
 */
export async function unpublishIfUnverified(eventId: string) {
  const db = useDatabase()

  const [eventRecord] = await db
    .select({ status: events.status })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)

  if (!eventRecord || eventRecord.status !== 'published') {
    return
  }

  const [verification] = await db
    .select({ status: eventVerifications.status })
    .from(eventVerifications)
    .where(eq(eventVerifications.eventId, eventId))
    .limit(1)

  if (!verification || verification.status !== 'approved') {
    await db
      .update(events)
      .set({ status: 'draft', updatedAt: new Date() })
      .where(eq(events.id, eventId))
  }
}

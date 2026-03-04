import { eq, and, isNotNull, sql } from 'drizzle-orm'
import { events } from '@nvyt/db'

interface GeocodingResult {
  address_components: Array<{
    long_name: string
    short_name: string
    types: string[]
  }>
}

interface GeocodingResponse {
  status: string
  results: GeocodingResult[]
}

/**
 * Backfill province (and city if missing) in locationDetails using Google Geocoding API.
 * Uses reverse geocoding from stored coordinates.
 *
 * POST /api/v1/admin/backfill-location-details
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  requireAdmin(user.email)

  const db = useDatabase()
  const config = useRuntimeConfig()
  const apiKey = config.public.googleMapsApiKey

  if (!apiKey) {
    throw createError({ statusCode: 500, message: 'Google Maps API key not configured' })
  }

  // Find events with locationDetails that have coordinates but no province
  const eventsToBackfill = await db
    .select({
      id: events.id,
      title: events.title,
      locationDetails: events.locationDetails,
    })
    .from(events)
    .where(
      and(
        isNotNull(events.locationDetails),
        sql`${events.locationDetails}->>'type' = 'physical'`,
        sql`${events.locationDetails}->'coordinates' IS NOT NULL`,
        sql`(${events.locationDetails}->>'province' IS NULL OR ${events.locationDetails}->>'province' = '')`,
      ),
    )

  console.log(`[Backfill] Found ${eventsToBackfill.length} events needing province backfill`)

  let processed = 0
  let skipped = 0
  let errors = 0
  const results: Array<{ eventId: string; title: string; status: string; message?: string }> = []

  for (const evt of eventsToBackfill) {
    const details = evt.locationDetails as Record<string, any>
    const coords = details?.coordinates

    if (!coords?.lat || !coords?.lng) {
      skipped++
      results.push({ eventId: evt.id, title: evt.title, status: 'skipped', message: 'No coordinates' })
      continue
    }

    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.lat},${coords.lng}&key=${apiKey}`
      const response = await $fetch<GeocodingResponse>(url)

      if (response.status !== 'OK' || !response.results?.length) {
        skipped++
        results.push({ eventId: evt.id, title: evt.title, status: 'skipped', message: `Geocoding status: ${response.status}` })
        continue
      }

      // Extract province and city from the first result
      let province: string | undefined
      let city: string | undefined

      for (const component of response.results[0].address_components) {
        if (component.types.includes('administrative_area_level_2')) {
          province = component.long_name
        }
        if (component.types.includes('locality')) {
          city = component.long_name
        }
      }

      if (!province) {
        skipped++
        results.push({ eventId: evt.id, title: evt.title, status: 'skipped', message: 'No province found in geocoding result' })
        continue
      }

      // Merge province (and city if missing) into existing locationDetails
      const updatedDetails = {
        ...details,
        province,
        ...(details.city ? {} : city ? { city } : {}),
      }

      await db
        .update(events)
        .set({ locationDetails: updatedDetails })
        .where(eq(events.id, evt.id))

      processed++
      const msg = `province=${province}${!details.city && city ? `, city=${city}` : ''}`
      results.push({ eventId: evt.id, title: evt.title, status: 'processed', message: msg })
      console.log(`[Backfill] ${evt.title}: ${msg}`)
    } catch (err) {
      errors++
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      results.push({ eventId: evt.id, title: evt.title, status: 'error', message: errorMessage })
      console.error(`[Backfill] Error for event ${evt.title}:`, err)
    }
  }

  console.log(`[Backfill] Complete: ${processed} processed, ${skipped} skipped, ${errors} errors`)

  return successResponse({
    summary: {
      total: eventsToBackfill.length,
      processed,
      skipped,
      errors,
    },
    results,
  })
})

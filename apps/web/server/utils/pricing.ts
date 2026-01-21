import { eq, and, lte, gte, gt, asc } from 'drizzle-orm'
import { ticketPriceTiers } from '@nvyt/db'

export interface ActivePrice {
  price: string
  tierName: string | null
  tierId: string | null
  isBaseTier: boolean
  nextTier: {
    name: string
    price: string
    startsAt: Date
  } | null
}

/**
 * Get the active price for a ticket type based on current time.
 * - If a tier is active (startDate <= now <= endDate), use that tier's price
 * - If no tier is active, fall back to the base price from ticketTypes
 * - Also returns info about the next upcoming tier (for countdown display)
 */
export async function getActivePrice(
  ticketTypeId: string,
  basePrice: string,
  now = new Date()
): Promise<ActivePrice> {
  const db = useDatabase()

  // Find active tier (where startDate <= now AND endDate >= now)
  const [activeTier] = await db
    .select()
    .from(ticketPriceTiers)
    .where(
      and(
        eq(ticketPriceTiers.ticketTypeId, ticketTypeId),
        lte(ticketPriceTiers.startDate, now),
        gte(ticketPriceTiers.endDate, now)
      )
    )
    .orderBy(asc(ticketPriceTiers.sortOrder))
    .limit(1)

  // Find next upcoming tier (for countdown display)
  const [nextTier] = await db
    .select()
    .from(ticketPriceTiers)
    .where(
      and(
        eq(ticketPriceTiers.ticketTypeId, ticketTypeId),
        gt(ticketPriceTiers.startDate, now)
      )
    )
    .orderBy(asc(ticketPriceTiers.startDate))
    .limit(1)

  if (activeTier) {
    return {
      price: activeTier.price,
      tierName: activeTier.name,
      tierId: activeTier.id,
      isBaseTier: false,
      nextTier: nextTier
        ? {
            name: nextTier.name,
            price: nextTier.price,
            startsAt: nextTier.startDate,
          }
        : null,
    }
  }

  // No active tier - use base price
  return {
    price: basePrice,
    tierName: null,
    tierId: null,
    isBaseTier: true,
    nextTier: nextTier
      ? {
          name: nextTier.name,
          price: nextTier.price,
          startsAt: nextTier.startDate,
        }
      : null,
  }
}

/**
 * Get all price tiers for a ticket type, sorted by sortOrder
 */
export async function getPriceTiers(ticketTypeId: string) {
  const db = useDatabase()
  return db
    .select()
    .from(ticketPriceTiers)
    .where(eq(ticketPriceTiers.ticketTypeId, ticketTypeId))
    .orderBy(asc(ticketPriceTiers.sortOrder), asc(ticketPriceTiers.startDate))
}

/**
 * Check if a new tier would overlap with existing tiers.
 * Overlap exists when: existing.start <= new.end AND existing.end >= new.start
 */
export async function checkTierOverlap(
  ticketTypeId: string,
  startDate: Date,
  endDate: Date,
  excludeTierId?: string
): Promise<boolean> {
  const db = useDatabase()
  const conditions = [
    eq(ticketPriceTiers.ticketTypeId, ticketTypeId),
    lte(ticketPriceTiers.startDate, endDate),
    gte(ticketPriceTiers.endDate, startDate),
  ]

  const overlapping = await db
    .select({ id: ticketPriceTiers.id })
    .from(ticketPriceTiers)
    .where(and(...conditions))

  // Filter out the tier being updated (if updating)
  const filtered = excludeTierId
    ? overlapping.filter((t) => t.id !== excludeTierId)
    : overlapping

  return filtered.length > 0
}

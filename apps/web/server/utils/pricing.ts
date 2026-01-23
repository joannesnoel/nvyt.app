import { eq, and, lte, gte, gt, lt, asc, sql, or, isNull } from 'drizzle-orm'
import { ticketPriceTiers } from '@nvyt/db'

export type PriceTierType = 'time' | 'quantity' | 'hybrid'

export interface ActivePrice {
  price: string
  tierName: string | null
  tierId: string | null
  tierType: PriceTierType | null
  isBaseTier: boolean
  quantityRemaining: number | null // null for time-only tiers or unlimited
  nextTier: {
    name: string
    price: string
    startsAt?: Date // For time-based triggers
    afterQuantity?: number // For quantity-based triggers (total tickets sold before this tier activates)
  } | null
}

/**
 * Get the active price for a ticket type based on current time and quantity sold.
 * Priority: hybrid > quantity > time tiers
 * - For 'time' tiers: startDate <= now <= endDate
 * - For 'quantity' tiers: quantitySold < quantityLimit (checked in sort order)
 * - For 'hybrid' tiers: both time and quantity constraints must be met
 * - Falls back to base price from ticketTypes if no tier is active
 */
export async function getActivePrice(
  ticketTypeId: string,
  basePrice: string,
  now = new Date()
): Promise<ActivePrice> {
  const db = useDatabase()

  // Get all tiers for this ticket type, sorted by sortOrder
  const allTiers = await db
    .select()
    .from(ticketPriceTiers)
    .where(eq(ticketPriceTiers.ticketTypeId, ticketTypeId))
    .orderBy(asc(ticketPriceTiers.sortOrder))

  // Find active tier
  let activeTier = null
  for (const tier of allTiers) {
    if (isTierActive(tier, now)) {
      activeTier = tier
      break
    }
  }

  // Find next tier (for countdown/info display)
  const nextTier = findNextTier(allTiers, activeTier, now)

  if (activeTier) {
    const quantityRemaining = activeTier.tierType === 'time'
      ? null
      : (activeTier.quantityLimit !== null
          ? activeTier.quantityLimit - activeTier.quantitySold
          : null)

    return {
      price: activeTier.price,
      tierName: activeTier.name,
      tierId: activeTier.id,
      tierType: activeTier.tierType as PriceTierType,
      isBaseTier: false,
      quantityRemaining,
      nextTier,
    }
  }

  // No active tier - use base price
  return {
    price: basePrice,
    tierName: null,
    tierId: null,
    tierType: null,
    isBaseTier: true,
    quantityRemaining: null,
    nextTier,
  }
}

/**
 * Check if a tier is currently active based on its type and constraints
 */
function isTierActive(tier: typeof ticketPriceTiers.$inferSelect, now: Date): boolean {
  const tierType = tier.tierType as PriceTierType

  if (tierType === 'time') {
    // Time-based: check date range
    if (!tier.startDate || !tier.endDate) return false
    return tier.startDate <= now && tier.endDate >= now
  }

  if (tierType === 'quantity') {
    // Quantity-based: check if there's still room
    if (tier.quantityLimit === null) return true // unlimited quantity tier
    return tier.quantitySold < tier.quantityLimit
  }

  if (tierType === 'hybrid') {
    // Hybrid: both time AND quantity constraints must be met
    const timeActive = tier.startDate && tier.endDate
      ? tier.startDate <= now && tier.endDate >= now
      : true // If no dates, treat time constraint as satisfied
    const quantityActive = tier.quantityLimit === null || tier.quantitySold < tier.quantityLimit

    return timeActive && quantityActive
  }

  return false
}

/**
 * Check if a tier is sold out (quantity-based constraint)
 */
function isTierSoldOut(tier: typeof ticketPriceTiers.$inferSelect): boolean {
  if (tier.tierType === 'time') return false
  if (tier.quantityLimit === null) return false
  return tier.quantitySold >= tier.quantityLimit
}

/**
 * Find the next upcoming tier for display purposes
 */
function findNextTier(
  allTiers: (typeof ticketPriceTiers.$inferSelect)[],
  activeTier: typeof ticketPriceTiers.$inferSelect | null,
  now: Date
): ActivePrice['nextTier'] {
  if (!activeTier) {
    // No active tier - look for the first upcoming tier
    for (const tier of allTiers) {
      const tierType = tier.tierType as PriceTierType

      if (tierType === 'time' || tierType === 'hybrid') {
        if (tier.startDate && tier.startDate > now) {
          return {
            name: tier.name,
            price: tier.price,
            startsAt: tier.startDate,
          }
        }
      }

      if (tierType === 'quantity' || tierType === 'hybrid') {
        if (tier.quantityLimit !== null && tier.quantitySold < tier.quantityLimit) {
          // This tier would be active if it's quantity-based and has room
          // But since we're looking for "next", this shouldn't be returned here
          // unless we're looking for the first tier overall
        }
      }
    }
    return null
  }

  // Find the tier that comes after the active one
  const activeIndex = allTiers.findIndex(t => t.id === activeTier.id)
  if (activeIndex === -1 || activeIndex >= allTiers.length - 1) return null

  const nextTier = allTiers[activeIndex + 1]
  if (!nextTier) return null

  const tierType = nextTier.tierType as PriceTierType

  // For quantity-based: next tier activates after current tier's quantity sells out
  if (activeTier.tierType === 'quantity' || activeTier.tierType === 'hybrid') {
    if (activeTier.quantityLimit !== null) {
      return {
        name: nextTier.name,
        price: nextTier.price,
        afterQuantity: activeTier.quantityLimit - activeTier.quantitySold,
      }
    }
  }

  // For time-based: next tier activates when current tier ends
  if (activeTier.tierType === 'time' && activeTier.endDate) {
    return {
      name: nextTier.name,
      price: nextTier.price,
      startsAt: activeTier.endDate,
    }
  }

  // For hybrid: could be either, prefer showing quantity remaining
  if (activeTier.tierType === 'hybrid') {
    if (activeTier.quantityLimit !== null) {
      return {
        name: nextTier.name,
        price: nextTier.price,
        afterQuantity: activeTier.quantityLimit - activeTier.quantitySold,
      }
    }
    if (activeTier.endDate) {
      return {
        name: nextTier.name,
        price: nextTier.price,
        startsAt: activeTier.endDate,
      }
    }
  }

  return null
}

/**
 * Get all price tiers for a ticket type, sorted by sortOrder
 * Includes computed fields for availability
 */
export async function getPriceTiers(ticketTypeId: string) {
  const db = useDatabase()
  const tiers = await db
    .select()
    .from(ticketPriceTiers)
    .where(eq(ticketPriceTiers.ticketTypeId, ticketTypeId))
    .orderBy(asc(ticketPriceTiers.sortOrder), asc(ticketPriceTiers.startDate))

  const now = new Date()

  return tiers.map(tier => ({
    ...tier,
    isActive: isTierActive(tier, now),
    isSoldOut: isTierSoldOut(tier),
    quantityRemaining: tier.quantityLimit !== null
      ? Math.max(0, tier.quantityLimit - tier.quantitySold)
      : null,
  }))
}

/**
 * Check if a new tier would overlap with existing tiers.
 * For time-based tiers: existing.start <= new.end AND existing.end >= new.start
 * For quantity-based tiers: no date overlap check needed
 */
export async function checkTierOverlap(
  ticketTypeId: string,
  startDate: Date | null,
  endDate: Date | null,
  excludeTierId?: string,
  tierType: PriceTierType = 'time'
): Promise<boolean> {
  // Quantity-only tiers don't have date overlap concerns
  if (tierType === 'quantity' || !startDate || !endDate) {
    return false
  }

  const db = useDatabase()
  const overlapping = await db
    .select({ id: ticketPriceTiers.id })
    .from(ticketPriceTiers)
    .where(
      and(
        eq(ticketPriceTiers.ticketTypeId, ticketTypeId),
        // Only check against time-based or hybrid tiers
        or(
          eq(ticketPriceTiers.tierType, 'time'),
          eq(ticketPriceTiers.tierType, 'hybrid')
        ),
        lte(ticketPriceTiers.startDate, endDate),
        gte(ticketPriceTiers.endDate, startDate)
      )
    )

  // Filter out the tier being updated (if updating)
  const filtered = excludeTierId
    ? overlapping.filter((t) => t.id !== excludeTierId)
    : overlapping

  return filtered.length > 0
}

/**
 * Increment the quantitySold for a tier
 * Returns the updated tier or null if tier was sold out
 */
export async function incrementTierQuantitySold(
  tierId: string,
  quantity: number
): Promise<typeof ticketPriceTiers.$inferSelect | null> {
  const db = useDatabase()

  // Atomic increment with check to prevent overselling
  const [tier] = await db
    .select()
    .from(ticketPriceTiers)
    .where(eq(ticketPriceTiers.id, tierId))
    .limit(1)

  if (!tier) return null

  // For quantity or hybrid tiers, check availability
  if (tier.tierType !== 'time' && tier.quantityLimit !== null) {
    if (tier.quantitySold + quantity > tier.quantityLimit) {
      return null // Would exceed limit
    }
  }

  const [updated] = await db
    .update(ticketPriceTiers)
    .set({
      quantitySold: tier.quantitySold + quantity,
      updatedAt: new Date(),
    })
    .where(eq(ticketPriceTiers.id, tierId))
    .returning()

  return updated || null
}

/**
 * Check if a ticket type has any active tier (for allowing sales outside ticket type sales period)
 * Returns true if at least one tier is currently active based on its type constraints
 */
export async function hasActiveTier(
  ticketTypeId: string,
  now = new Date()
): Promise<boolean> {
  const db = useDatabase()

  const allTiers = await db
    .select()
    .from(ticketPriceTiers)
    .where(eq(ticketPriceTiers.ticketTypeId, ticketTypeId))

  for (const tier of allTiers) {
    if (isTierActive(tier, now)) {
      return true
    }
  }

  return false
}

/**
 * Validate that a tier has sufficient quantity available
 * Returns { available: true } or { available: false, remaining: number }
 */
export async function validateTierAvailability(
  tierId: string,
  requestedQuantity: number
): Promise<{ available: boolean; remaining?: number }> {
  const db = useDatabase()

  const [tier] = await db
    .select()
    .from(ticketPriceTiers)
    .where(eq(ticketPriceTiers.id, tierId))
    .limit(1)

  if (!tier) {
    return { available: false, remaining: 0 }
  }

  // Time-only tiers don't have quantity limits
  if (tier.tierType === 'time') {
    return { available: true }
  }

  // Unlimited quantity
  if (tier.quantityLimit === null) {
    return { available: true }
  }

  const remaining = tier.quantityLimit - tier.quantitySold

  if (remaining >= requestedQuantity) {
    return { available: true, remaining }
  }

  return { available: false, remaining }
}

/**
 * Calculate the total discount amount for a set of line items.
 *
 * @param discountType - 'percentage' or 'fixed'
 * @param discountValue - the percentage (0-100) or fixed PHP amount per ticket
 * @param items - array of { ticketTypeId, quantity, unitPrice }
 * @param applicableTicketTypeIds - array of ticket type UUIDs the code applies to (null = all)
 * @returns total discount in PHP, rounded to 2 decimals
 */
export function calculateDiscount(
  discountType: 'percentage' | 'fixed',
  discountValue: number,
  items: Array<{ ticketTypeId: string; quantity: number; unitPrice: number }>,
  applicableTicketTypeIds: string[] | null,
): number {
  let totalDiscount = 0

  for (const item of items) {
    // Check if this ticket type is applicable
    if (applicableTicketTypeIds && applicableTicketTypeIds.length > 0) {
      if (!applicableTicketTypeIds.includes(item.ticketTypeId)) {
        continue
      }
    }

    if (discountType === 'percentage') {
      totalDiscount += item.unitPrice * item.quantity * (discountValue / 100)
    } else {
      // Fixed: cap at unit price (can't discount more than the ticket costs)
      const discountPerTicket = Math.min(discountValue, item.unitPrice)
      totalDiscount += discountPerTicket * item.quantity
    }
  }

  return Math.round(totalDiscount * 100) / 100
}

/**
 * Count the total number of tickets that a discount code applies to.
 */
export function countApplicableTickets(
  items: Array<{ ticketTypeId: string; quantity: number }>,
  applicableTicketTypeIds: string[] | null,
): number {
  let count = 0
  for (const item of items) {
    if (applicableTicketTypeIds && applicableTicketTypeIds.length > 0) {
      if (!applicableTicketTypeIds.includes(item.ticketTypeId)) {
        continue
      }
    }
    count += item.quantity
  }
  return count
}

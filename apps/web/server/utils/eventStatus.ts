import type { Event, TicketType, TicketPriceTier } from '@nvyt/db'
import { isTierActive } from './pricing'

export type EventStatusCode =
  | 'cancelled'
  | 'ended'
  | 'sold_out'
  | 'on_sale_tier'
  | 'on_sale'
  | 'coming_soon'
  | 'sales_closed'
  | 'rsvp_open'
  | 'none'

export type EventStatusColor = 'red' | 'gray' | 'green' | 'amber' | 'blue'
export type EventStatusVariant = 'solid' | 'soft'

export interface EventStatus {
  code: EventStatusCode
  label: string
  color: EventStatusColor
  variant: EventStatusVariant
}

export interface TicketTypeWithTiers extends TicketType {
  priceTiers: TicketPriceTier[]
}

type EventForStatus = Pick<
  Event,
  'status' | 'startDate' | 'endDate' | 'registrationMode'
>

interface TicketTypeAvailability {
  isSoldOut: boolean
  inSalesPeriod: boolean
  hasActiveTier: boolean
  isOnSale: boolean
  activeTier: TicketPriceTier | null
  hasUpcomingSale: boolean
}

function computeAvailability(
  ticketType: TicketTypeWithTiers,
  now: Date,
): TicketTypeAvailability {
  const isSoldOut =
    ticketType.status === 'sold_out' ||
    (ticketType.quantity != null && ticketType.quantitySold >= ticketType.quantity)

  const inSalesPeriod =
    (!ticketType.salesStart || ticketType.salesStart <= now) &&
    (!ticketType.salesEnd || ticketType.salesEnd >= now)

  const activeTier = ticketType.priceTiers.find(t => isTierActive(t, now)) ?? null
  const hasActiveTier = activeTier !== null

  const isOnSale =
    ticketType.status === 'active' &&
    !isSoldOut &&
    (inSalesPeriod || hasActiveTier)

  const ticketTypeUpcoming =
    !!ticketType.salesStart && ticketType.salesStart > now
  const upcomingTier = ticketType.priceTiers.some(
    t =>
      (t.tierType === 'time' || t.tierType === 'hybrid') &&
      t.startDate &&
      t.startDate > now,
  )
  const hasUpcomingSale = ticketTypeUpcoming || upcomingTier

  return {
    isSoldOut,
    inSalesPeriod,
    hasActiveTier,
    isOnSale,
    activeTier,
    hasUpcomingSale,
  }
}

export function computeEventStatus(
  event: EventForStatus,
  ticketTypes: TicketTypeWithTiers[] = [],
  now: Date = new Date(),
): EventStatus {
  if (event.status === 'cancelled') {
    return { code: 'cancelled', label: 'Cancelled', color: 'red', variant: 'solid' }
  }

  const effectiveEnd = event.endDate ?? event.startDate
  if (effectiveEnd && effectiveEnd < now) {
    return { code: 'ended', label: 'Ended', color: 'gray', variant: 'solid' }
  }

  if (event.registrationMode === 'tickets') {
    if (ticketTypes.length === 0) {
      return { code: 'coming_soon', label: 'Tickets Coming Soon', color: 'blue', variant: 'solid' }
    }

    const availabilities = ticketTypes.map(t => ({
      ticketType: t,
      ...computeAvailability(t, now),
    }))

    const allSoldOut = availabilities.every(a => a.isSoldOut)
    if (allSoldOut) {
      return { code: 'sold_out', label: 'Sold Out', color: 'red', variant: 'soft' }
    }

    const tierOnSale = availabilities.find(a => a.isOnSale && a.activeTier !== null)
    if (tierOnSale && tierOnSale.activeTier) {
      return {
        code: 'on_sale_tier',
        label: tierOnSale.activeTier.name,
        color: 'amber',
        variant: 'solid',
      }
    }

    const anyOnSale = availabilities.some(a => a.isOnSale)
    if (anyOnSale) {
      return { code: 'on_sale', label: 'Tickets On Sale', color: 'green', variant: 'solid' }
    }

    const anyUpcoming = availabilities.some(a => a.hasUpcomingSale && !a.isSoldOut)
    if (anyUpcoming) {
      return { code: 'coming_soon', label: 'Tickets Coming Soon', color: 'blue', variant: 'solid' }
    }

    return { code: 'sales_closed', label: 'Sales Closed', color: 'gray', variant: 'soft' }
  }

  if (event.registrationMode === 'rsvp') {
    return { code: 'rsvp_open', label: 'RSVP Open', color: 'green', variant: 'soft' }
  }

  return { code: 'none', label: '', color: 'gray', variant: 'soft' }
}

import Pusher from 'pusher'

let pusherInstance: Pusher | null = null

export function usePusher(): Pusher | null {
  if (pusherInstance) {
    return pusherInstance
  }

  const config = useRuntimeConfig()

  // Check if Pusher is configured
  if (!config.pusherAppId || !config.pusherSecret || !config.public.pusherKey) {
    console.warn('[Pusher] Not configured - real-time features disabled')
    return null
  }

  pusherInstance = new Pusher({
    appId: config.pusherAppId,
    key: config.public.pusherKey,
    secret: config.pusherSecret,
    cluster: config.public.pusherCluster,
    useTLS: true,
  })

  return pusherInstance
}

// Channel naming conventions
export const channels = {
  // Order-specific channel for ticket status updates
  order: (orderNumber: string) => `order-${orderNumber}`,
  // Event-specific channel for organizers (attendee check-ins, RSVPs)
  event: (eventId: string) => `event-${eventId}`,
  // User-specific channel for personal notifications
  user: (userId: string) => `private-user-${userId}`,
}

// Event types
export const pusherEvents = {
  // Ticket events
  TICKET_CHECKED_IN: 'ticket:checked-in',
  TICKET_STATUS_CHANGED: 'ticket:status-changed',
  // Attendee events (RSVP)
  ATTENDEE_CHECKED_IN: 'attendee:checked-in',
  ATTENDEE_STATUS_CHANGED: 'attendee:status-changed',
  // Order events
  ORDER_PAYMENT_CONFIRMED: 'order:payment-confirmed',
}

// Helper to broadcast ticket check-in
export async function broadcastTicketCheckIn(data: {
  orderNumber: string
  ticketId: string
  ticketNumber: string
  status: string
  checkedInAt: Date
}) {
  const pusher = usePusher()
  if (!pusher) return

  try {
    await pusher.trigger(
      channels.order(data.orderNumber),
      pusherEvents.TICKET_CHECKED_IN,
      {
        ticketId: data.ticketId,
        ticketNumber: data.ticketNumber,
        status: data.status,
        checkedInAt: data.checkedInAt.toISOString(),
      }
    )
  } catch (error) {
    console.error('[Pusher] Failed to broadcast ticket check-in:', error)
  }
}

// Helper to broadcast attendee check-in (for RSVP events)
export async function broadcastAttendeeCheckIn(data: {
  eventId: string
  attendeeId: string
  userId: string
  status: string
  checkedInAt: Date
}) {
  const pusher = usePusher()
  if (!pusher) return

  try {
    await pusher.trigger(
      channels.event(data.eventId),
      pusherEvents.ATTENDEE_CHECKED_IN,
      {
        attendeeId: data.attendeeId,
        userId: data.userId,
        status: data.status,
        checkedInAt: data.checkedInAt.toISOString(),
      }
    )
  } catch (error) {
    console.error('[Pusher] Failed to broadcast attendee check-in:', error)
  }
}

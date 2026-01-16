import Pusher from 'pusher-js'
import type { Channel } from 'pusher-js'

let pusherInstance: Pusher | null = null

// Channel naming conventions (must match server)
export const channels = {
  order: (orderNumber: string) => `order-${orderNumber}`,
  event: (eventId: string) => `event-${eventId}`,
  user: (userId: string) => `private-user-${userId}`,
}

// Event types (must match server)
export const pusherEvents = {
  TICKET_CHECKED_IN: 'ticket:checked-in',
  TICKET_STATUS_CHANGED: 'ticket:status-changed',
  ATTENDEE_CHECKED_IN: 'attendee:checked-in',
  ATTENDEE_STATUS_CHANGED: 'attendee:status-changed',
  ORDER_PAYMENT_CONFIRMED: 'order:payment-confirmed',
}

export function usePusher() {
  const config = useRuntimeConfig()
  const subscribedChannels = ref<Map<string, Channel>>(new Map())

  // Initialize Pusher client
  const initPusher = (): Pusher | null => {
    if (pusherInstance) {
      return pusherInstance
    }

    if (!config.public.pusherKey) {
      console.warn('[Pusher] Not configured - real-time features disabled')
      return null
    }

    pusherInstance = new Pusher(config.public.pusherKey, {
      cluster: config.public.pusherCluster,
    })

    return pusherInstance
  }

  // Subscribe to a channel
  const subscribe = (channelName: string): Channel | null => {
    const pusher = initPusher()
    if (!pusher) return null

    // Return existing subscription if already subscribed
    if (subscribedChannels.value.has(channelName)) {
      return subscribedChannels.value.get(channelName) as Channel
    }

    const channel = pusher.subscribe(channelName)
    subscribedChannels.value.set(channelName, channel)
    return channel
  }

  // Unsubscribe from a channel
  const unsubscribe = (channelName: string) => {
    const pusher = initPusher()
    if (!pusher) return

    pusher.unsubscribe(channelName)
    subscribedChannels.value.delete(channelName)
  }

  // Unsubscribe from all channels
  const unsubscribeAll = () => {
    const pusher = initPusher()
    if (!pusher) return

    subscribedChannels.value.forEach((_, channelName) => {
      pusher.unsubscribe(channelName)
    })
    subscribedChannels.value.clear()
  }

  // Cleanup on unmount
  onUnmounted(() => {
    unsubscribeAll()
  })

  return {
    subscribe,
    unsubscribe,
    unsubscribeAll,
    channels,
    events: pusherEvents,
  }
}

// Composable for subscribing to order updates
export function useOrderUpdates(orderNumber: Ref<string | undefined> | string) {
  const { subscribe, unsubscribe, channels, events } = usePusher()

  const ticketUpdates = ref<{
    ticketId: string
    ticketNumber: string
    status: string
    checkedInAt: string
  }[]>([])

  let currentChannel: Channel | null = null
  let currentChannelName: string | null = null

  const subscribeToOrder = (orderNum: string) => {
    if (!orderNum) return

    // Unsubscribe from previous channel if different
    if (currentChannelName && currentChannelName !== channels.order(orderNum)) {
      unsubscribe(currentChannelName)
    }

    currentChannelName = channels.order(orderNum)
    currentChannel = subscribe(currentChannelName)

    if (currentChannel) {
      currentChannel.bind(events.TICKET_CHECKED_IN, (data: any) => {
        ticketUpdates.value.push(data)
      })
    }
  }

  // Watch for order number changes
  if (typeof orderNumber === 'string') {
    subscribeToOrder(orderNumber)
  } else {
    watch(orderNumber, (newOrderNum) => {
      if (newOrderNum) {
        subscribeToOrder(newOrderNum)
      }
    }, { immediate: true })
  }

  // Cleanup
  onUnmounted(() => {
    if (currentChannelName) {
      unsubscribe(currentChannelName)
    }
  })

  return {
    ticketUpdates,
  }
}

// Composable for subscribing to event updates (for organizers)
export function useEventUpdates(eventId: Ref<string | undefined> | string) {
  const { subscribe, unsubscribe, channels, events } = usePusher()

  const attendeeUpdates = ref<{
    attendeeId: string
    userId: string
    status: string
    checkedInAt: string
  }[]>([])

  let currentChannel: Channel | null = null
  let currentChannelName: string | null = null

  const subscribeToEvent = (evtId: string) => {
    if (!evtId) return

    // Unsubscribe from previous channel if different
    if (currentChannelName && currentChannelName !== channels.event(evtId)) {
      unsubscribe(currentChannelName)
    }

    currentChannelName = channels.event(evtId)
    currentChannel = subscribe(currentChannelName)

    if (currentChannel) {
      currentChannel.bind(events.ATTENDEE_CHECKED_IN, (data: any) => {
        attendeeUpdates.value.push(data)
      })
    }
  }

  // Watch for event ID changes
  if (typeof eventId === 'string') {
    subscribeToEvent(eventId)
  } else {
    watch(eventId, (newEventId) => {
      if (newEventId) {
        subscribeToEvent(newEventId)
      }
    }, { immediate: true })
  }

  // Cleanup
  onUnmounted(() => {
    if (currentChannelName) {
      unsubscribe(currentChannelName)
    }
  })

  return {
    attendeeUpdates,
  }
}

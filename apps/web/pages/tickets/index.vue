<script setup lang="ts">
definePageMeta({
  layout: 'default',
  middleware: 'auth',
})

const { getEventImage } = useYoutubeThumbnail()
const route = useRoute()
const page = computed(() => Number(route.query.page) || 1)
const status = computed(() => (route.query.status as string) || '')
const eventId = computed(() => (route.query.eventId as string) || '')

// Fetch user's registrations (tickets + RSVPs)
const { data: response, pending } = await useFetch('/api/v1/registrations', {
  query: computed(() => ({
    page: page.value,
    limit: 20,
    status: status.value || undefined,
    eventId: eventId.value || undefined,
  })),
  watch: [page, status, eventId],
})

const registrations = computed(() => response.value?.data ?? [])
const meta = computed(() => response.value?.meta)

// Group registrations by order (tickets) or keep as standalone (RSVPs)
const groupedRegistrations = computed(() => {
  const groups: Array<{
    key: string
    type: 'order' | 'rsvp'
    event: any
    order?: { orderNumber: string; paymentStatus: string }
    tickets: any[]
    rsvp?: any
    isPurchaser?: boolean
    purchaser?: any
    isInactive: boolean
  }> = []
  const orderMap = new Map<string, typeof groups[number]>()

  for (const reg of registrations.value) {
    if (reg.type === 'ticket' && reg.order?.orderNumber) {
      const existing = orderMap.get(reg.order.orderNumber)
      if (existing) {
        existing.tickets.push(reg)
      } else {
        const group = {
          key: reg.order.orderNumber,
          type: 'order' as const,
          event: reg.event,
          order: reg.order,
          tickets: [reg],
          isPurchaser: reg.isPurchaser,
          purchaser: reg.purchaser,
          isInactive: false,
        }
        orderMap.set(reg.order.orderNumber, group)
        groups.push(group)
      }
    } else {
      groups.push({
        key: `rsvp-${reg.id}`,
        type: 'rsvp',
        event: reg.event,
        tickets: [],
        rsvp: reg,
        isInactive: reg.status === 'cancelled' || reg.status === 'declined',
      })
    }
  }

  // Update isInactive for order groups
  for (const group of groups) {
    if (group.type === 'order') {
      group.isInactive = group.tickets.every(
        (t: any) => t.status === 'cancelled' || t.status === 'refunded'
      )
    }
  }

  return groups
})

// Get event info from the first item when filtering by event
const filteredEvent = computed(() => {
  if (!eventId.value || registrations.value.length === 0) return null
  return registrations.value[0]?.event
})

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getStatusColor(status: string) {
  switch (status) {
    case 'confirmed': return 'green'
    case 'pending': return 'yellow'
    case 'checked_in': return 'blue'
    case 'waitlisted': return 'blue'
    case 'cancelled': return 'red'
    case 'declined': return 'red'
    case 'refunded': return 'gray'
    default: return 'gray'
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'checked_in': return 'Checked In'
    case 'pending': return 'Pending'
    case 'confirmed': return 'Confirmed'
    case 'waitlisted': return 'Waitlisted'
    case 'cancelled': return 'Cancelled'
    case 'declined': return 'Declined'
    case 'refunded': return 'Refunded'
    default: return status
  }
}

function getPaymentStatusColor(status: string) {
  switch (status) {
    case 'paid': return 'green'
    case 'pending': return 'yellow'
    case 'failed': return 'red'
    case 'refunded': return 'gray'
    default: return 'gray'
  }
}

function isUpcoming(date: string) {
  return new Date(date) > new Date()
}

// Filter options
const statusOptions = [
  { label: 'All', value: '' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Pending', value: 'pending' },
  { label: 'Checked In', value: 'checked_in' },
  { label: 'Waitlisted', value: 'waitlisted' },
  { label: 'Cancelled', value: 'cancelled' },
]
</script>

<template>
  <div class="py-8">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Back link when filtered by event -->
      <NuxtLink
        v-if="eventId"
        to="/tickets"
        class="inline-flex items-center gap-1 text-gray-600 dark:text-gray-400 hover:text-primary mb-4"
      >
        <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
        Back to All Registrations
      </NuxtLink>

      <!-- Header -->
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ eventId && filteredEvent ? `Registrations for ${filteredEvent.title}` : 'My Registrations' }}
          </h1>
          <p class="text-gray-600 dark:text-gray-400">
            {{ eventId ? `${meta?.total ?? registrations.length} registration${(meta?.total ?? registrations.length) !== 1 ? 's' : ''} for this event` : 'Your tickets and RSVPs' }}
          </p>
        </div>

        <USelectMenu
          v-model="status"
          :options="statusOptions"
          value-attribute="value"
          option-attribute="label"
          placeholder="Filter by status"
          class="w-48"
          @update:model-value="navigateTo({ query: { ...route.query, status: $event || undefined, page: 1 } })"
        />
      </div>

      <!-- Loading -->
      <div v-if="pending" class="space-y-4">
        <USkeleton v-for="i in 5" :key="i" class="h-32" />
      </div>

      <!-- Empty State -->
      <div v-else-if="registrations.length === 0" class="text-center py-16">
        <UIcon name="i-heroicons-ticket" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          No Registrations Yet
        </h2>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          When you RSVP or purchase tickets for events, they'll appear here.
        </p>
        <UButton to="/events" color="primary">
          Browse Events
        </UButton>
      </div>

      <!-- Registrations List (grouped by order) -->
      <div v-else class="space-y-4">
        <UCard
          v-for="group in groupedRegistrations"
          :key="group.key"
          :class="{ 'opacity-60': group.isInactive }"
        >
          <div class="flex flex-col md:flex-row gap-4">
            <!-- Event Image -->
            <div class="w-full md:w-32 h-24 bg-gray-100 dark:bg-gray-800 rounded-lg flex-shrink-0 overflow-hidden">
              <img
                v-if="group.event && getEventImage(group.event)"
                :src="getEventImage(group.event)!.src"
                :alt="group.event.title"
                class="w-full h-full object-cover"
                @error="(e: Event) => {
                  const img = e.target as HTMLImageElement
                  const eventImg = group.event ? getEventImage(group.event) : null
                  if (eventImg?.fallback && img.src !== eventImg.fallback) {
                    img.src = eventImg.fallback
                  }
                }"
              >
              <div v-else class="w-full h-full flex items-center justify-center">
                <UIcon name="i-heroicons-calendar" class="w-8 h-8 text-gray-400" />
              </div>
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <!-- Header row: event title + badges -->
              <div class="flex items-start justify-between gap-2">
                <div>
                  <NuxtLink
                    :to="`/events/${group.event?.slug}`"
                    class="font-semibold text-gray-900 dark:text-white hover:text-primary"
                  >
                    {{ group.event?.title }}
                  </NuxtLink>
                  <p v-if="group.type === 'rsvp'" class="text-sm text-gray-500 mt-0.5">
                    RSVP
                  </p>
                  <p v-else-if="group.order" class="text-sm text-gray-500 mt-0.5">
                    Order {{ group.order.orderNumber }}
                    <span class="mx-1">&middot;</span>
                    {{ group.tickets.length }} ticket{{ group.tickets.length !== 1 ? 's' : '' }}
                  </p>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <UBadge
                    v-if="group.event?.startDate && isUpcoming(group.event.startDate)"
                    color="blue"
                    variant="soft"
                    size="sm"
                  >
                    Upcoming
                  </UBadge>
                  <!-- Order payment status -->
                  <UBadge
                    v-if="group.type === 'order' && group.order"
                    :color="getPaymentStatusColor(group.order.paymentStatus)"
                    variant="soft"
                  >
                    {{ group.order.paymentStatus }}
                  </UBadge>
                  <!-- RSVP status -->
                  <UBadge
                    v-if="group.type === 'rsvp' && group.rsvp"
                    :color="getStatusColor(group.rsvp.status)"
                    variant="soft"
                  >
                    {{ getStatusLabel(group.rsvp.status) }}
                  </UBadge>
                </div>
              </div>

              <!-- Event date & location -->
              <div class="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-500">
                <div class="flex items-center gap-1">
                  <UIcon name="i-heroicons-calendar" class="w-4 h-4" />
                  {{ formatDate(group.event?.startDate) }}
                </div>
                <div v-if="group.event?.locationDetails?.city || group.event?.locationDetails?.province" class="flex items-center gap-1">
                  <UIcon name="i-heroicons-map-pin" class="w-4 h-4" />
                  {{ [group.event.locationDetails.city, group.event.locationDetails.province].filter(Boolean).join(', ') }}
                </div>
              </div>

              <!-- Ticket list (for orders) -->
              <div v-if="group.type === 'order' && group.tickets.length > 0" class="mt-3 space-y-2">
                <div
                  v-for="ticket in group.tickets"
                  :key="ticket.id"
                  class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <div class="flex items-center gap-3 min-w-0">
                    <div class="min-w-0">
                      <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {{ ticket.ticketType?.name }}
                      </p>
                      <div class="flex items-center gap-2 text-xs text-gray-500">
                        <span class="font-mono">{{ ticket.ticketNumber }}</span>
                        <template v-if="ticket.attendeeName">
                          <span>&middot;</span>
                          <span>{{ ticket.attendeeName }}</span>
                        </template>
                      </div>
                    </div>
                  </div>
                  <div class="flex items-center gap-2 flex-shrink-0">
                    <UBadge
                      :color="getStatusColor(ticket.status)"
                      variant="soft"
                      size="sm"
                    >
                      {{ getStatusLabel(ticket.status) }}
                    </UBadge>
                    <UButton
                      v-if="ticket.status === 'confirmed' || ticket.status === 'checked_in'"
                      :to="`/tickets/${ticket.ticketId}`"
                      color="gray"
                      variant="ghost"
                      size="xs"
                      icon="i-heroicons-qr-code"
                    >
                      QR
                    </UButton>
                  </div>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex flex-wrap items-center gap-2 mt-3">
                <!-- Order actions -->
                <template v-if="group.type === 'order'">
                  <UButton
                    v-if="group.isPurchaser"
                    :to="`/orders/${group.order?.orderNumber}`"
                    color="primary"
                    size="sm"
                    icon="i-heroicons-eye"
                  >
                    View Order
                  </UButton>
                  <div
                    v-else-if="group.purchaser?.name"
                    class="flex items-center gap-1.5 text-sm text-gray-500"
                  >
                    <UIcon name="i-heroicons-gift" class="w-4 h-4" />
                    <span>Purchased by <span class="font-medium text-gray-700 dark:text-gray-300">{{ group.purchaser.name }}</span></span>
                  </div>
                </template>
                <!-- RSVP actions -->
                <template v-else-if="group.type === 'rsvp'">
                  <UButton
                    :to="`/events/${group.event?.slug}`"
                    color="primary"
                    size="sm"
                    icon="i-heroicons-eye"
                  >
                    View Event
                  </UButton>
                </template>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Pagination -->
        <div v-if="meta && (meta.totalPages ?? 0) > 1" class="flex justify-center mt-8">
          <UPagination
            v-model="page"
            :page-count="meta.limit ?? 20"
            :total="meta.total ?? 0"
            @update:model-value="navigateTo({ query: { ...route.query, page: $event } })"
          />
        </div>
      </div>
    </div>
  </div>
</template>

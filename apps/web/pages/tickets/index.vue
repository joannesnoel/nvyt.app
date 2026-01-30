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

      <!-- Registrations List -->
      <div v-else class="space-y-4">
        <UCard
          v-for="reg in registrations"
          :key="reg.id"
          :class="{ 'opacity-60': reg.status === 'cancelled' || reg.status === 'refunded' || reg.status === 'declined' }"
        >
          <div class="flex flex-col md:flex-row gap-4">
            <!-- Event Image -->
            <div class="w-full md:w-32 h-24 bg-gray-100 dark:bg-gray-800 rounded-lg flex-shrink-0 overflow-hidden">
              <img
                v-if="reg.event && getEventImage(reg.event)"
                :src="getEventImage(reg.event)!.src"
                :alt="reg.event.title"
                class="w-full h-full object-cover"
                @error="(e: Event) => {
                  const img = e.target as HTMLImageElement
                  const eventImg = reg.event ? getEventImage(reg.event) : null
                  if (eventImg?.fallback && img.src !== eventImg.fallback) {
                    img.src = eventImg.fallback
                  }
                }"
              >
              <div v-else class="w-full h-full flex items-center justify-center">
                <UIcon name="i-heroicons-calendar" class="w-8 h-8 text-gray-400" />
              </div>
            </div>

            <!-- Registration Info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <NuxtLink
                    :to="`/events/${reg.event?.slug}`"
                    class="font-semibold text-gray-900 dark:text-white hover:text-primary"
                  >
                    {{ reg.event?.title }}
                  </NuxtLink>
                  <!-- Ticket type (tickets only) -->
                  <p v-if="reg.type === 'ticket' && reg.ticketType" class="text-sm text-gray-500 mt-1">
                    {{ reg.ticketType.name }}
                  </p>
                  <!-- RSVP label -->
                  <p v-else-if="reg.type === 'rsvp'" class="text-sm text-gray-500 mt-1">
                    RSVP
                  </p>
                  <!-- Attendee info (tickets only) -->
                  <p v-if="reg.attendeeName || reg.attendeeEmail" class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    <span v-if="reg.attendeeName">{{ reg.attendeeName }}</span>
                    <span v-if="reg.attendeeName && reg.attendeeEmail"> &middot; </span>
                    <span v-if="reg.attendeeEmail">{{ reg.attendeeEmail }}</span>
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <UBadge
                    v-if="reg.event?.startDate && isUpcoming(reg.event.startDate)"
                    color="blue"
                    variant="soft"
                    size="sm"
                  >
                    Upcoming
                  </UBadge>
                  <UBadge
                    :color="getStatusColor(reg.status)"
                    variant="soft"
                  >
                    {{ getStatusLabel(reg.status) }}
                  </UBadge>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-500">
                <div class="flex items-center gap-1">
                  <UIcon name="i-heroicons-calendar" class="w-4 h-4" />
                  {{ formatDate(reg.event?.startDate) }}
                </div>
                <div v-if="reg.event?.location" class="flex items-center gap-1">
                  <UIcon name="i-heroicons-map-pin" class="w-4 h-4" />
                  {{ reg.event.location }}
                </div>
                <div v-if="reg.ticketNumber" class="flex items-center gap-1 font-mono text-xs">
                  <UIcon name="i-heroicons-ticket" class="w-4 h-4" />
                  {{ reg.ticketNumber }}
                </div>
              </div>

              <!-- Actions -->
              <div class="flex flex-wrap items-center gap-2 mt-4">
                <!-- Ticket actions -->
                <template v-if="reg.type === 'ticket'">
                  <UButton
                    :to="`/tickets/${reg.ticketId}`"
                    color="primary"
                    size="sm"
                    icon="i-heroicons-qr-code"
                  >
                    View QR Code
                  </UButton>
                  <UButton
                    v-if="reg.isPurchaser"
                    :to="`/orders/${reg.order?.orderNumber}`"
                    color="gray"
                    variant="ghost"
                    size="sm"
                  >
                    View Order
                  </UButton>
                  <div
                    v-else-if="reg.purchaser?.name"
                    class="flex items-center gap-1.5 text-sm text-gray-500"
                  >
                    <UIcon name="i-heroicons-gift" class="w-4 h-4" />
                    <span>Purchased by <span class="font-medium text-gray-700 dark:text-gray-300">{{ reg.purchaser.name }}</span></span>
                  </div>
                </template>
                <!-- RSVP actions -->
                <template v-else-if="reg.type === 'rsvp'">
                  <UButton
                    :to="`/events/${reg.event?.slug}`"
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

<script setup lang="ts">
definePageMeta({
  layout: 'default',
  middleware: 'auth',
})

const route = useRoute()
const page = computed(() => Number(route.query.page) || 1)
const status = computed(() => (route.query.status as string) || '')

// Fetch user's tickets
const { data: ticketsResponse, pending, refresh } = await useFetch('/api/v1/tickets', {
  query: computed(() => ({
    page: page.value,
    limit: 20,
    status: status.value || undefined,
  })),
  watch: [page, status],
})

const tickets = computed(() => ticketsResponse.value?.data ?? [])
const meta = computed(() => ticketsResponse.value?.meta)

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
    case 'cancelled': return 'red'
    case 'refunded': return 'gray'
    default: return 'gray'
  }
}

function isUpcoming(date: string) {
  return new Date(date) > new Date()
}

// Filter options
const statusOptions = [
  { label: 'All Tickets', value: '' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Pending', value: 'pending' },
  { label: 'Checked In', value: 'checked_in' },
  { label: 'Cancelled', value: 'cancelled' },
]
</script>

<template>
  <div class="py-8">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">My Tickets</h1>
          <p class="text-gray-600 dark:text-gray-400">
            View and manage your event tickets
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
      <div v-else-if="tickets.length === 0" class="text-center py-16">
        <UIcon name="i-heroicons-ticket" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          No Tickets Yet
        </h2>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          When you purchase tickets for events, they'll appear here.
        </p>
        <UButton to="/events" color="primary">
          Browse Events
        </UButton>
      </div>

      <!-- Tickets List -->
      <div v-else class="space-y-4">
        <UCard
          v-for="ticket in tickets"
          :key="ticket.id"
          :class="{ 'opacity-60': ticket.status === 'cancelled' || ticket.status === 'refunded' }"
        >
          <div class="flex flex-col md:flex-row gap-4">
            <!-- Event Image -->
            <div class="w-full md:w-32 h-24 bg-gray-100 dark:bg-gray-800 rounded-lg flex-shrink-0 overflow-hidden">
              <img
                v-if="ticket.event?.coverImage"
                :src="ticket.event.coverImage"
                :alt="ticket.event.title"
                class="w-full h-full object-cover"
              >
              <div v-else class="w-full h-full flex items-center justify-center">
                <UIcon name="i-heroicons-calendar" class="w-8 h-8 text-gray-400" />
              </div>
            </div>

            <!-- Ticket Info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <NuxtLink
                    :to="`/events/${ticket.event?.slug}`"
                    class="font-semibold text-gray-900 dark:text-white hover:text-primary"
                  >
                    {{ ticket.event?.title }}
                  </NuxtLink>
                  <p class="text-sm text-gray-500 mt-1">
                    {{ ticket.ticketType?.name }}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <UBadge
                    v-if="ticket.event?.startDate && isUpcoming(ticket.event.startDate)"
                    color="blue"
                    variant="soft"
                    size="sm"
                  >
                    Upcoming
                  </UBadge>
                  <UBadge
                    :color="getStatusColor(ticket.status)"
                    variant="soft"
                  >
                    {{ ticket.status.replace('_', ' ') }}
                  </UBadge>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-500">
                <div class="flex items-center gap-1">
                  <UIcon name="i-heroicons-calendar" class="w-4 h-4" />
                  {{ formatDate(ticket.event?.startDate) }}
                </div>
                <div v-if="ticket.event?.location" class="flex items-center gap-1">
                  <UIcon name="i-heroicons-map-pin" class="w-4 h-4" />
                  {{ ticket.event.location }}
                </div>
                <div class="flex items-center gap-1 font-mono text-xs">
                  <UIcon name="i-heroicons-ticket" class="w-4 h-4" />
                  {{ ticket.ticketNumber }}
                </div>
              </div>

              <!-- Actions -->
              <div class="flex flex-wrap items-center gap-2 mt-4">
                <UButton
                  :to="`/tickets/${ticket.id}`"
                  color="primary"
                  size="sm"
                  icon="i-heroicons-qr-code"
                >
                  View QR Code
                </UButton>
                <UButton
                  :to="`/orders/${ticket.order?.orderNumber}`"
                  color="gray"
                  variant="ghost"
                  size="sm"
                >
                  View Order
                </UButton>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Pagination -->
        <div v-if="meta && meta.totalPages > 1" class="flex justify-center mt-8">
          <UPagination
            v-model="page"
            :page-count="meta.limit"
            :total="meta.total"
            @update:model-value="navigateTo({ query: { ...route.query, page: $event } })"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default',
  middleware: 'auth',
})

useHead({ title: 'My Events - NVYT' })

const { getEventImage } = useYoutubeThumbnail()

// Filter state
const statusFilter = ref<string>('all')
const searchQuery = ref('')

// Fetch my events
const { data: eventsData, pending: eventsPending } = await useFetch('/api/v1/events/my-events')

const allEvents = computed(() => eventsData.value?.data?.events ?? [])

// Filtered events
const filteredEvents = computed(() => {
  let events = allEvents.value

  // Filter by status
  if (statusFilter.value !== 'all') {
    events = events.filter((e: any) => e.status === statusFilter.value)
  }

  // Filter by search query
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    events = events.filter((e: any) =>
      e.title.toLowerCase().includes(query) ||
      e.location?.toLowerCase().includes(query)
    )
  }

  return events
})

// Stats
const stats = computed(() => {
  const events = allEvents.value
  return {
    total: events.length,
    published: events.filter((e: any) => e.status === 'published').length,
    draft: events.filter((e: any) => e.status === 'draft').length,
    completed: events.filter((e: any) => e.status === 'completed').length,
  }
})

const statusOptions = [
  { label: 'All Events', value: 'all' },
  { label: 'Live', value: 'published' },
  { label: 'Draft', value: 'draft' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
]

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getStatusLabel(status: string) {
  return status === 'published' ? 'Live' : status
}

function getStatusColor(status: string) {
  switch (status) {
    case 'published': return 'green'
    case 'draft': return 'yellow'
    case 'cancelled': return 'red'
    case 'completed': return 'gray'
    default: return 'gray'
  }
}

function isUpcoming(date: string) {
  return new Date(date) > new Date()
}
</script>

<template>
  <div class="py-12">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
        <div>
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
            My Events
          </h1>
          <p class="text-gray-600 dark:text-gray-400 mt-2">
            Events you've created and organized
          </p>
        </div>

        <UButton to="/dashboard/events/new" color="primary" icon="i-heroicons-plus">
          Create Event
        </UButton>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <UCard>
          <div class="text-center">
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.total }}</p>
            <p class="text-sm text-gray-500">Total Events</p>
          </div>
        </UCard>
        <UCard>
          <div class="text-center">
            <p class="text-2xl font-bold text-green-600">{{ stats.published }}</p>
            <p class="text-sm text-gray-500">Published</p>
          </div>
        </UCard>
        <UCard>
          <div class="text-center">
            <p class="text-2xl font-bold text-yellow-600">{{ stats.draft }}</p>
            <p class="text-sm text-gray-500">Drafts</p>
          </div>
        </UCard>
        <UCard>
          <div class="text-center">
            <p class="text-2xl font-bold text-gray-600">{{ stats.completed }}</p>
            <p class="text-sm text-gray-500">Completed</p>
          </div>
        </UCard>
      </div>

      <!-- Filters -->
      <div class="flex flex-col sm:flex-row gap-4 mb-6">
        <UInput
          v-model="searchQuery"
          placeholder="Search events..."
          icon="i-heroicons-magnifying-glass"
          class="flex-1"
        />
        <USelectMenu
          v-model="statusFilter"
          :options="statusOptions"
          value-attribute="value"
          option-attribute="label"
          class="w-full sm:w-48"
        />
      </div>

      <!-- Loading -->
      <div v-if="eventsPending" class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        <USkeleton v-for="i in 6" :key="i" class="h-64 rounded-xl" />
      </div>

      <!-- Empty State -->
      <div v-else-if="allEvents.length === 0" class="text-center py-16 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
        <UIcon name="i-heroicons-calendar-days" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 class="text-xl font-medium text-gray-900 dark:text-white mb-2">
          No events yet
        </h3>
        <p class="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
          Create your first event to start selling tickets and managing attendees.
        </p>
        <UButton to="/dashboard/events/new" color="primary" size="lg">
          <UIcon name="i-heroicons-plus" class="w-5 h-5 mr-2" />
          Create Your First Event
        </UButton>
      </div>

      <!-- No Results -->
      <div v-else-if="filteredEvents.length === 0" class="text-center py-12 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
        <UIcon name="i-heroicons-magnifying-glass" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No events found
        </h3>
        <p class="text-gray-600 dark:text-gray-400 mb-4">
          Try adjusting your search or filter criteria
        </p>
        <UButton color="gray" variant="outline" @click="searchQuery = ''; statusFilter = 'all'">
          Clear Filters
        </UButton>
      </div>

      <!-- Events Grid -->
      <div v-else class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        <NuxtLink
          v-for="event in filteredEvents"
          :key="event.id"
          :to="`/dashboard/events/${event.id}`"
          class="group rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden hover:border-primary dark:hover:border-primary transition-colors"
        >
          <div class="relative bg-gray-100 dark:bg-gray-800 overflow-hidden" style="padding-bottom: 56.25%;">
            <img
              v-if="getEventImage(event)"
              :src="getEventImage(event)!.src"
              :alt="event.title"
              class="absolute inset-0 w-full h-full object-cover"
              @error="(e: Event) => {
                const img = e.target as HTMLImageElement
                const eventImg = getEventImage(event)
                if (eventImg?.fallback && img.src !== eventImg.fallback) {
                  img.src = eventImg.fallback
                }
              }"
            >
            <div v-else class="absolute inset-0 flex items-center justify-center">
              <UIcon name="i-heroicons-photo" class="w-12 h-12 text-gray-400" />
            </div>

            <!-- Upcoming Badge -->
            <div v-if="isUpcoming(event.startDate) && event.status === 'published'" class="absolute top-2 left-2">
              <UBadge color="blue" variant="solid" size="xs">
                Upcoming
              </UBadge>
            </div>
          </div>
          <div class="p-4">
            <div class="flex items-start justify-between gap-2 mb-1">
              <h3 class="font-semibold text-gray-900 dark:text-white group-hover:text-primary transition-colors line-clamp-2">
                {{ event.title }}
              </h3>
              <UBadge :color="getStatusColor(event.status)" variant="soft" size="xs" class="flex-shrink-0">
                {{ getStatusLabel(event.status) }}
              </UBadge>
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
              <UIcon name="i-heroicons-calendar-days" class="w-4 h-4 inline mr-1" />
              {{ formatDate(event.startDate) }}
            </p>
            <p v-if="event.locationDetails?.city || event.locationDetails?.province" class="text-sm text-gray-500 mt-1 truncate">
              <UIcon name="i-heroicons-map-pin" class="w-4 h-4 inline mr-1" />
              {{ [event.locationDetails.city, event.locationDetails.province].filter(Boolean).join(', ') }}
            </p>

            <!-- Stats -->
            <div class="flex items-center gap-4 text-sm pt-3 mt-3 border-t border-gray-100 dark:border-gray-800">
              <span class="text-green-600">
                <UIcon name="i-heroicons-users" class="w-4 h-4 inline mr-1" />
                {{ event.stats?.confirmed ?? 0 }} confirmed
              </span>
              <span v-if="event.stats?.pending > 0" class="text-yellow-600">
                {{ event.stats.pending }} pending
              </span>
            </div>
          </div>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

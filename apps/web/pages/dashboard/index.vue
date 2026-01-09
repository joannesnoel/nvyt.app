<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const { user } = useAuth()

// Fetch my events
const { data: eventsData, pending } = await useFetch('/api/v1/events/my-events')

const myEvents = computed(() => eventsData.value?.data?.events ?? [])
const totals = computed(() => eventsData.value?.data?.totals ?? {
  events: 0,
  attendees: 0,
  pending: 0,
})

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
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
</script>

<template>
  <div class="py-12">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="flex justify-between items-center mb-8">
        <div>
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
            Dashboard
          </h1>
          <p class="text-gray-600 dark:text-gray-400 mt-2">
            Welcome back{{ user?.name ? `, ${user.name}` : '' }}
          </p>
        </div>

        <UButton to="/dashboard/events/new" color="primary" icon="i-heroicons-plus">
          Create Event
        </UButton>
      </div>

      <!-- Stats -->
      <div class="grid md:grid-cols-4 gap-6 mb-8">
        <UCard>
          <div class="flex items-center gap-4">
            <div class="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <UIcon name="i-heroicons-calendar-days" class="w-6 h-6 text-primary" />
            </div>
            <div>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ totals.events }}</p>
              <p class="text-sm text-gray-600 dark:text-gray-400">Total Events</p>
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center gap-4">
            <div class="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <UIcon name="i-heroicons-users" class="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ totals.attendees }}</p>
              <p class="text-sm text-gray-600 dark:text-gray-400">Confirmed Attendees</p>
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center gap-4">
            <div class="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <UIcon name="i-heroicons-clock" class="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ totals.pending }}</p>
              <p class="text-sm text-gray-600 dark:text-gray-400">Pending RSVPs</p>
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center gap-4">
            <div class="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <UIcon name="i-heroicons-ticket" class="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">0</p>
              <p class="text-sm text-gray-600 dark:text-gray-400">Tickets Sold</p>
            </div>
          </div>
        </UCard>
      </div>

      <!-- My Events -->
      <div>
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          My Events
        </h2>

        <!-- Loading -->
        <div v-if="pending" class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <USkeleton v-for="i in 3" :key="i" class="h-48 rounded-xl" />
        </div>

        <!-- Empty State -->
        <div v-else-if="myEvents.length === 0" class="text-center py-12 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
          <UIcon name="i-heroicons-calendar-days" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No events yet
          </h3>
          <p class="text-gray-600 dark:text-gray-400 mb-4">
            Create your first event to get started
          </p>
          <UButton to="/dashboard/events/new" color="primary">
            Create Event
          </UButton>
        </div>

        <!-- Events Grid -->
        <div v-else class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <NuxtLink
            v-for="event in myEvents"
            :key="event.id"
            :to="`/dashboard/events/${event.id}`"
            class="group block"
          >
            <UCard class="h-full hover:ring-2 hover:ring-primary transition-all">
              <!-- Cover Image -->
              <template #header>
                <div class="aspect-video bg-gray-100 dark:bg-gray-800 -m-4 mb-0 rounded-t-lg overflow-hidden">
                  <img
                    v-if="event.coverImage"
                    :src="event.coverImage"
                    :alt="event.title"
                    class="w-full h-full object-cover"
                  >
                  <div v-else class="w-full h-full flex items-center justify-center">
                    <UIcon name="i-heroicons-photo" class="w-10 h-10 text-gray-400" />
                  </div>
                </div>
              </template>

              <!-- Content -->
              <div>
                <div class="flex items-start justify-between gap-2 mb-2">
                  <h3 class="font-semibold text-gray-900 dark:text-white group-hover:text-primary transition-colors line-clamp-1">
                    {{ event.title }}
                  </h3>
                  <UBadge :color="getStatusColor(event.status)" variant="soft" size="xs">
                    {{ event.status }}
                  </UBadge>
                </div>

                <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  <UIcon name="i-heroicons-calendar-days" class="w-4 h-4 inline mr-1" />
                  {{ formatDate(event.startDate) }}
                  <span v-if="event.location" class="ml-2">
                    <UIcon name="i-heroicons-map-pin" class="w-4 h-4 inline mr-1" />
                    {{ event.location }}
                  </span>
                </p>

                <!-- Stats -->
                <div class="flex items-center gap-4 text-sm">
                  <span class="text-green-600">
                    <UIcon name="i-heroicons-users" class="w-4 h-4 inline mr-1" />
                    {{ event.stats.confirmed }} confirmed
                  </span>
                  <span v-if="event.stats.pending > 0" class="text-yellow-600">
                    {{ event.stats.pending }} pending
                  </span>
                </div>
              </div>
            </UCard>
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

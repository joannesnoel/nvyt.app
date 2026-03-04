<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const { user } = useAuth()
const { getEventImage } = useYoutubeThumbnail()

// Fetch my events
const { data: eventsData, pending: eventsPending } = await useFetch('/api/v1/events/my-events')

// Fetch my registrations (tickets + RSVPs unified)
const { data: registrationsResponse, pending: registrationsPending } = await useFetch('/api/v1/registrations', {
  query: { limit: 10 },
})

const myEvents = computed(() => eventsData.value?.data?.events ?? [])
const myRegistrations = computed(() => registrationsResponse.value?.data ?? [])

// Group registrations by event
const registrationsByEvent = computed(() => {
  const grouped = new Map<string, {
    event: any
    items: any[]
    count: number
    hasRsvp: boolean
    rsvpStatus?: string
  }>()

  for (const reg of myRegistrations.value) {
    if (!reg.event) continue

    const eventId = reg.event.id
    if (!grouped.has(eventId)) {
      grouped.set(eventId, {
        event: reg.event,
        items: [],
        count: 0,
        hasRsvp: false,
      })
    }

    const group = grouped.get(eventId)!
    group.items.push(reg)
    group.count++
    if (reg.type === 'rsvp') {
      group.hasRsvp = true
      group.rsvpStatus = reg.status
    }
  }

  // Sort by event date (upcoming first)
  return Array.from(grouped.values()).sort((a, b) => {
    const dateA = new Date(a.event.startDate).getTime()
    const dateB = new Date(b.event.startDate).getTime()
    return dateA - dateB
  })
})

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
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

function getRegStatusColor(status: string) {
  switch (status) {
    case 'confirmed': return 'green'
    case 'pending': return 'yellow'
    case 'checked_in': return 'blue'
    case 'waitlisted': return 'blue'
    case 'cancelled': return 'red'
    case 'declined': return 'red'
    default: return 'gray'
  }
}

function getRegStatusLabel(status: string) {
  switch (status) {
    case 'confirmed': return 'Confirmed'
    case 'pending': return 'Pending Approval'
    case 'waitlisted': return 'Waitlisted'
    case 'checked_in': return 'Checked In'
    case 'declined': return 'Declined'
    case 'cancelled': return 'Cancelled'
    default: return status
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

      <!-- Getting Started (shown for new users with no events) -->
      <div v-if="!eventsPending && !registrationsPending && myEvents.length === 0 && myRegistrations.length === 0" class="mb-8">
        <UCard class="bg-gradient-to-br from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20 border-primary-200 dark:border-primary-800">
          <div class="text-center py-4">
            <div class="w-16 h-16 bg-primary-100 dark:bg-primary-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
              <UIcon name="i-heroicons-sparkles" class="w-8 h-8 text-primary" />
            </div>
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Welcome to nvyt!
            </h2>
            <p class="text-gray-600 dark:text-gray-400 mb-6 max-w-lg mx-auto">
              nvyt makes it easy to create events, sell tickets, and manage attendees. Here's how to get started:
            </p>

            <div class="grid sm:grid-cols-3 gap-4 text-left max-w-3xl mx-auto">
              <div class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <div class="w-8 h-8 bg-primary-100 dark:bg-primary-900/50 rounded-full flex items-center justify-center mb-3">
                  <span class="text-primary font-bold text-sm">1</span>
                </div>
                <h3 class="font-medium text-gray-900 dark:text-white mb-1">Create an Event</h3>
                <p class="text-sm text-gray-500">Set up your event with a title, date, location, and description.</p>
              </div>

              <div class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <div class="w-8 h-8 bg-primary-100 dark:bg-primary-900/50 rounded-full flex items-center justify-center mb-3">
                  <span class="text-primary font-bold text-sm">2</span>
                </div>
                <h3 class="font-medium text-gray-900 dark:text-white mb-1">Add Tickets</h3>
                <p class="text-sm text-gray-500">Create ticket types - free RSVPs or paid tickets with different tiers.</p>
              </div>

              <div class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <div class="w-8 h-8 bg-primary-100 dark:bg-primary-900/50 rounded-full flex items-center justify-center mb-3">
                  <span class="text-primary font-bold text-sm">3</span>
                </div>
                <h3 class="font-medium text-gray-900 dark:text-white mb-1">Share & Manage</h3>
                <p class="text-sm text-gray-500">Share your event link, track registrations, and check in attendees.</p>
              </div>
            </div>

            <UButton to="/dashboard/events/new" color="primary" size="lg" class="mt-6">
              <UIcon name="i-heroicons-plus" class="w-5 h-5 mr-2" />
              Create Your First Event
            </UButton>
          </div>
        </UCard>
      </div>

      <!-- My Registrations (tickets + RSVPs unified) -->
      <div v-if="myRegistrations.length > 0 || registrationsPending" class="mb-8">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
            My Registrations
          </h2>
          <UButton to="/tickets" color="gray" variant="ghost" size="sm">
            View All
          </UButton>
        </div>

        <!-- Loading -->
        <div v-if="registrationsPending" class="space-y-3">
          <USkeleton v-for="i in 3" :key="i" class="h-20" />
        </div>

        <!-- Grouped by Event -->
        <div v-else class="space-y-3">
          <NuxtLink
            v-for="group in registrationsByEvent"
            :key="group.event.id"
            :to="group.hasRsvp ? `/events/${group.event.slug}` : `/tickets?eventId=${group.event.id}`"
            class="block"
          >
            <UCard class="hover:ring-2 hover:ring-primary transition-all">
              <div class="flex items-center gap-4">
                <!-- Event Image -->
                <div class="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-lg flex-shrink-0 overflow-hidden">
                  <img
                    v-if="getEventImage(group.event)"
                    :src="getEventImage(group.event)!.src"
                    :alt="group.event.title"
                    class="w-full h-full object-cover"
                    @error="(e: Event) => {
                      const img = e.target as HTMLImageElement
                      const eventImg = getEventImage(group.event)
                      if (eventImg?.fallback && img.src !== eventImg.fallback) {
                        img.src = eventImg.fallback
                      }
                    }"
                  >
                  <div v-else class="w-full h-full flex items-center justify-center">
                    <UIcon name="i-heroicons-calendar" class="w-6 h-6 text-gray-400" />
                  </div>
                </div>

                <!-- Event Info -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <h3 class="font-medium text-gray-900 dark:text-white truncate">
                      {{ group.event.title }}
                    </h3>
                    <UBadge
                      v-if="isUpcoming(group.event.startDate)"
                      color="blue"
                      variant="soft"
                      size="xs"
                    >
                      Upcoming
                    </UBadge>
                  </div>
                  <p class="text-sm text-gray-500 mt-1">
                    <UIcon name="i-heroicons-calendar" class="w-3.5 h-3.5 inline mr-1" />
                    {{ formatDateTime(group.event.startDate) }}
                    <span v-if="group.event.locationDetails?.city || group.event.locationDetails?.province" class="ml-2">
                      <UIcon name="i-heroicons-map-pin" class="w-3.5 h-3.5 inline mr-1" />
                      {{ [group.event.locationDetails.city, group.event.locationDetails.province].filter(Boolean).join(', ') }}
                    </span>
                  </p>
                </div>

                <!-- Status / Count -->
                <div class="flex-shrink-0">
                  <!-- RSVP: show status badge -->
                  <UBadge
                    v-if="group.hasRsvp"
                    :color="getRegStatusColor(group.rsvpStatus!)"
                    variant="soft"
                    size="sm"
                  >
                    {{ getRegStatusLabel(group.rsvpStatus!) }}
                  </UBadge>
                  <!-- Tickets: show count -->
                  <div v-else class="flex items-center gap-1.5 px-2.5 py-1 bg-primary-50 dark:bg-primary-900/30 text-primary rounded-full text-sm font-medium">
                    <UIcon name="i-heroicons-ticket" class="w-4 h-4" />
                    <span>{{ group.count }}</span>
                  </div>
                </div>
              </div>
            </UCard>
          </NuxtLink>
        </div>
      </div>

      <!-- My Events -->
      <div>
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          My Events
        </h2>

        <!-- Loading -->
        <div v-if="eventsPending" class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                  {{ event.stats.confirmed }} confirmed
                </span>
                <span v-if="event.stats.pending > 0" class="text-yellow-600">
                  {{ event.stats.pending }} pending
                </span>
              </div>
            </div>
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

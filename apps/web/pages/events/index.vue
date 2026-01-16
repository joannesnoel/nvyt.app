<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const { getEventImage } = useYoutubeThumbnail()

// TODO: Replace with actual API call
const { data: events, pending } = await useFetch('/api/v1/events')
</script>

<template>
  <div class="py-12">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center mb-8">
        <div>
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
            Explore Events
          </h1>
          <p class="text-gray-600 dark:text-gray-400 mt-2">
            Discover upcoming events in your area
          </p>
        </div>

        <UButton to="/dashboard/events/new" color="primary" icon="i-heroicons-plus">
          Create Event
        </UButton>
      </div>

      <!-- Loading State -->
      <div v-if="pending" class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          v-for="i in 6"
          :key="i"
          class="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden"
        >
          <USkeleton class="h-48 w-full" />
          <div class="p-4 space-y-3">
            <USkeleton class="h-6 w-3/4" />
            <USkeleton class="h-4 w-1/2" />
            <USkeleton class="h-4 w-full" />
          </div>
        </div>
      </div>

      <!-- Events Grid -->
      <div v-else-if="events?.data?.length" class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        <NuxtLink
          v-for="event in events.data"
          :key="event.id"
          :to="`/events/${event.slug}`"
          class="group rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden hover:border-primary dark:hover:border-primary transition-colors"
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
            <h3 class="font-semibold text-gray-900 dark:text-white group-hover:text-primary transition-colors">
              {{ event.title }}
            </h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {{ new Date(event.startDate).toLocaleDateString() }}
            </p>
            <p class="text-sm text-gray-500 dark:text-gray-500 mt-2 line-clamp-2">
              {{ event.description }}
            </p>
          </div>
        </NuxtLink>
      </div>

      <!-- Empty State -->
      <div v-else class="text-center py-20">
        <UIcon name="i-heroicons-calendar-days" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No events yet
        </h3>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          Be the first to create an event!
        </p>
        <UButton to="/dashboard/events/new" color="primary">
          Create Event
        </UButton>
      </div>
    </div>
  </div>
</template>

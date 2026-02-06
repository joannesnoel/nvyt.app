<script setup lang="ts">
const route = useRoute()
const colorMode = useColorMode()

const emit = defineEmits<{
  close: []
}>()

// Get current event ID from route
const currentEventId = computed(() => {
  const match = route.path.match(/\/dashboard\/events\/([^/]+)/)
  return match ? match[1] : null
})

// Fetch event details for the title
const { data: eventData } = await useFetch(
  () => currentEventId.value ? `/api/v1/events/by-id/${currentEventId.value}` : null,
  { watch: [currentEventId] }
)
const eventTitle = computed(() => eventData.value?.data?.title || 'Event')

// Grouped event management navigation
const eventNavGroups = computed(() => {
  const id = currentEventId.value
  if (!id) return []
  return [
    {
      items: [
        { label: 'Overview', icon: 'i-heroicons-squares-2x2', to: `/dashboard/events/${id}` },
      ]
    },
    {
      label: 'Setup',
      items: [
        { label: 'Event Info', icon: 'i-heroicons-pencil-square', to: `/dashboard/events/${id}/edit` },
        { label: 'Page Template', icon: 'i-heroicons-paint-brush', to: `/dashboard/events/${id}/preview` },
        { label: 'Guest Form', icon: 'i-heroicons-clipboard-document-list', to: `/dashboard/events/${id}/registration` },
        { label: 'Team Members', icon: 'i-heroicons-user-group', to: `/dashboard/events/${id}/team` },
      ]
    },
    {
      label: 'Tickets & Sales',
      items: [
        { label: 'Tickets', icon: 'i-heroicons-ticket', to: `/dashboard/events/${id}/tickets` },
        { label: 'Discounts', icon: 'i-heroicons-tag', to: `/dashboard/events/${id}/discounts` },
        { label: 'Orders', icon: 'i-heroicons-shopping-cart', to: `/dashboard/events/${id}/orders` },
      ]
    },
    {
      label: 'Guests',
      items: [
        { label: 'Attendees', icon: 'i-heroicons-users', to: `/dashboard/events/${id}/attendees` },
        { label: 'Check-in', icon: 'i-heroicons-qr-code', to: `/dashboard/events/${id}/check-in` },
        { label: 'Invite', icon: 'i-heroicons-envelope', to: `/dashboard/events/${id}/invite` },
      ]
    },
    {
      label: 'Content',
      items: [
        { label: 'Announcements', icon: 'i-heroicons-megaphone', to: `/dashboard/events/${id}/announcements` },
        { label: 'FAQs', icon: 'i-heroicons-question-mark-circle', to: `/dashboard/events/${id}/faqs` },
      ]
    },
  ]
})

function isActive(to: string) {
  return route.path === to
}

function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <div class="flex flex-col h-full dashboard-sidebar-bg">
    <!-- Header with back link -->
    <div class="px-4 py-4 border-b border-gray-200 dark:border-gray-800">
      <NuxtLink
        to="/dashboard"
        class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors mb-3"
        @click="emit('close')"
      >
        <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
        <span>Back to Dashboard</span>
      </NuxtLink>
      <h2 class="font-semibold text-gray-900 dark:text-white truncate">
        {{ eventTitle }}
      </h2>
    </div>

    <!-- Event Navigation -->
    <nav class="flex-1 px-3 py-4 overflow-y-auto">
      <div class="space-y-6">
        <div v-for="(group, groupIndex) in eventNavGroups" :key="groupIndex">
          <!-- Group Label -->
          <p v-if="group.label" class="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {{ group.label }}
          </p>
          <!-- Group Items -->
          <div class="space-y-1">
            <NuxtLink
              v-for="item in group.items"
              :key="item.to"
              :to="item.to"
              class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150"
              :class="isActive(item.to)
                ? 'dashboard-nav-active bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'"
              @click="emit('close')"
            >
              <UIcon :name="item.icon" class="w-5 h-5 flex-shrink-0" />
              <span>{{ item.label }}</span>
            </NuxtLink>
          </div>
        </div>
      </div>
    </nav>

    <!-- Footer -->
    <div class="px-3 py-4 border-t border-gray-200 dark:border-gray-800">
      <div class="flex items-center justify-between px-3">
        <NuxtLink
          to="/"
          class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          @click="emit('close')"
        >
          <UIcon name="i-heroicons-home" class="w-4 h-4" />
          <span>Home</span>
        </NuxtLink>
        <UButton
          :icon="colorMode.value === 'dark' ? 'i-heroicons-sun' : 'i-heroicons-moon'"
          color="gray"
          variant="ghost"
          size="sm"
          @click="toggleColorMode"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { isAuthenticated } = useAuth()
const route = useRoute()

// Fetch pending registrations only for authenticated users
// Watch route.path to refetch when navigating between pages
const { data: response, pending, refresh } = await useFetch('/api/v1/me/pending-registrations', {
  immediate: isAuthenticated.value,
  watch: [isAuthenticated],
  default: () => ({ data: { pendingRegistrations: [] } }),
})

// Refresh data when route changes (e.g., after completing registration)
watch(() => route.fullPath, () => {
  if (isAuthenticated.value) {
    refresh()
  }
})

const pendingRegistrations = computed(() => response.value?.data?.pendingRegistrations ?? [])

// Show banner only for authenticated users with pending registrations
// Don't show on the registration page itself
const showBanner = computed(() => {
  if (!isAuthenticated.value) return false
  if (pendingRegistrations.value.length === 0) return false
  // Don't show on registration pages
  if (route.path.includes('/register')) return false
  return true
})

// Get the first pending registration to show
const currentReminder = computed(() => pendingRegistrations.value[0])

// Total pending count
const totalPending = computed(() => {
  return pendingRegistrations.value.reduce(
    (sum: number, r: any) => sum + (r.registrationStats?.pending ?? 0),
    0
  )
})
</script>

<template>
  <div
    v-if="showBanner && !pending && currentReminder"
    class="fixed bottom-14 sm:bottom-12 inset-x-0 z-40 bg-primary-600 text-white px-4 py-3 shadow-lg"
  >
    <div class="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
      <div class="flex items-center gap-3 flex-1 min-w-0">
        <div class="p-1.5 bg-white/20 rounded-full flex-shrink-0">
          <UIcon name="i-heroicons-clipboard-document-list" class="w-4 h-4" />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium truncate">
            <span class="hidden sm:inline">Complete registration for </span>
            <span class="font-semibold">{{ currentReminder.event.title }}</span>
            <span v-if="pendingRegistrations.length > 1" class="text-white/80">
              (+{{ pendingRegistrations.length - 1 }} more)
            </span>
          </p>
          <p class="text-xs text-white/80 hidden sm:block">
            {{ totalPending }} ticket{{ totalPending !== 1 ? 's' : '' }} need attendee information
          </p>
        </div>
      </div>
      <UButton
        :to="`/orders/${currentReminder.orderNumber}/register`"
        color="white"
        size="sm"
        class="flex-shrink-0"
      >
        Complete Now
      </UButton>
    </div>
  </div>
</template>

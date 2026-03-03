<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
})

const route = useRoute()

// Filters
const filters = reactive({
  page: parseInt(route.query.page as string) || 1,
  limit: 20,
  search: (route.query.search as string) || '',
  status: (route.query.status as string) || '',
  registrationMode: (route.query.registrationMode as string) || '',
})

// Debounced search
const debouncedSearch = ref(filters.search)
let searchTimeout: ReturnType<typeof setTimeout>
watch(() => filters.search, (val) => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    debouncedSearch.value = val
    filters.page = 1
  }, 300)
})

// Reset page when filters change
watch(() => filters.status, () => { filters.page = 1 })
watch(() => filters.registrationMode, () => { filters.page = 1 })

// Build query params
const queryParams = computed(() => {
  const params: Record<string, string | number> = {
    page: filters.page,
    limit: filters.limit,
  }
  if (debouncedSearch.value) params.search = debouncedSearch.value
  if (filters.status) params.status = filters.status
  if (filters.registrationMode) params.registrationMode = filters.registrationMode
  return params
})

// Fetch events
const { data, pending } = await useFetch('/api/v1/admin/events', {
  query: queryParams,
  watch: [queryParams],
})

const events = computed(() => data.value?.data?.events || [])
const stats = computed(() => data.value?.data?.stats || { total: 0, published: 0, draft: 0, cancelledCompleted: 0 })
const pagination = computed(() => ({
  page: data.value?.meta?.page ?? 1,
  limit: data.value?.meta?.limit ?? 20,
  total: data.value?.meta?.total ?? 0,
  totalPages: data.value?.meta?.totalPages ?? 1,
}))

function formatDate(date: string | Date) {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
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

function getStatusLabel(status: string) {
  return status === 'published' ? 'Live' : status.charAt(0).toUpperCase() + status.slice(1)
}

function getRegModeColor(mode: string) {
  switch (mode) {
    case 'tickets': return 'indigo'
    case 'rsvp': return 'blue'
    case 'open': return 'green'
    default: return 'gray'
  }
}

function getRegModeLabel(mode: string) {
  switch (mode) {
    case 'tickets': return 'Tickets'
    case 'rsvp': return 'RSVP'
    case 'open': return 'Open'
    default: return mode
  }
}

function getRegistrationCount(evt: any) {
  return evt.registrationMode === 'tickets' ? evt.ticketCount : evt.attendeeCount
}

const statusOptions = [
  { label: 'All Statuses', value: '' },
  { label: 'Published', value: 'published' },
  { label: 'Draft', value: 'draft' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'Completed', value: 'completed' },
]

const regModeOptions = [
  { label: 'All Modes', value: '' },
  { label: 'Tickets', value: 'tickets' },
  { label: 'RSVP', value: 'rsvp' },
  { label: 'Open', value: 'open' },
]
</script>

<template>
  <div>
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
        Events
      </h1>
      <p class="text-gray-600 dark:text-gray-400 mt-1">
        Browse and inspect all events on the platform
      </p>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      <AdminStatCard
        title="Total Events"
        :value="stats.total"
        icon="i-heroicons-calendar-days"
        color="indigo"
      />
      <AdminStatCard
        title="Published"
        :value="stats.published"
        icon="i-heroicons-globe-alt"
        color="green"
      />
      <AdminStatCard
        title="Draft"
        :value="stats.draft"
        icon="i-heroicons-pencil-square"
        color="yellow"
      />
      <AdminStatCard
        title="Cancelled / Completed"
        :value="stats.cancelledCompleted"
        icon="i-heroicons-archive-box"
        color="gray"
      />
    </div>

    <!-- Filters -->
    <UCard class="mb-6">
      <div class="flex flex-col sm:flex-row gap-4 items-end">
        <UFormGroup label="Search" class="flex-1">
          <UInput
            v-model="filters.search"
            placeholder="Search by event title or organizer..."
            icon="i-heroicons-magnifying-glass"
          />
        </UFormGroup>
        <UFormGroup label="Status">
          <USelectMenu
            v-model="filters.status"
            :options="statusOptions"
            value-attribute="value"
            option-attribute="label"
          />
        </UFormGroup>
        <UFormGroup label="Registration Mode">
          <USelectMenu
            v-model="filters.registrationMode"
            :options="regModeOptions"
            value-attribute="value"
            option-attribute="label"
          />
        </UFormGroup>
      </div>
    </UCard>

    <!-- Events Table -->
    <UCard>
      <div v-if="pending" class="space-y-4">
        <USkeleton v-for="i in 5" :key="i" class="h-16" />
      </div>

      <div v-else-if="events.length === 0" class="text-center py-12">
        <UIcon name="i-heroicons-calendar-days" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p class="text-gray-500">No events found</p>
      </div>

      <div v-else class="overflow-x-auto -mx-4 sm:mx-0">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead>
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Event
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Organizer
              </th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Mode
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Registrations
              </th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Revenue
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
            <tr
              v-for="evt in events"
              :key="evt.id"
              class="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
              @click="navigateTo(`/admin/events/${evt.id}`)"
            >
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <img
                    v-if="evt.thumbnailImage"
                    :src="evt.thumbnailImage"
                    :alt="evt.title"
                    class="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                  />
                  <div
                    v-else
                    class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0"
                  >
                    <UIcon name="i-heroicons-calendar-days" class="w-5 h-5 text-gray-400" />
                  </div>
                  <span class="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[200px]">
                    {{ evt.title }}
                  </span>
                </div>
              </td>
              <td class="px-4 py-3">
                <div>
                  <p class="text-sm font-medium text-gray-900 dark:text-white">{{ evt.organizer.name }}</p>
                  <p class="text-xs text-gray-500">{{ evt.organizer.email }}</p>
                </div>
              </td>
              <td class="px-4 py-3 text-center">
                <UBadge :color="getStatusColor(evt.status)" variant="soft" size="xs">
                  {{ getStatusLabel(evt.status) }}
                </UBadge>
              </td>
              <td class="px-4 py-3 text-center">
                <UBadge :color="getRegModeColor(evt.registrationMode)" variant="soft" size="xs">
                  {{ getRegModeLabel(evt.registrationMode) }}
                </UBadge>
              </td>
              <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                {{ formatDate(evt.startDate) }}
              </td>
              <td class="px-4 py-3 text-center text-sm text-gray-900 dark:text-white">
                {{ getRegistrationCount(evt) }}
              </td>
              <td class="px-4 py-3 text-right text-sm text-gray-900 dark:text-white">
                {{ evt.registrationMode === 'tickets' ? formatCurrency(evt.revenue) : '-' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div v-if="pagination.totalPages > 1" class="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700 mt-4">
        <p class="text-sm text-gray-500">
          Showing {{ (pagination.page - 1) * pagination.limit + 1 }} to
          {{ Math.min(pagination.page * pagination.limit, pagination.total) }} of
          {{ pagination.total }}
        </p>
        <div class="flex gap-2">
          <UButton
            color="gray"
            variant="outline"
            size="sm"
            :disabled="pagination.page <= 1"
            @click="filters.page = pagination.page - 1"
          >
            Previous
          </UButton>
          <UButton
            color="gray"
            variant="outline"
            size="sm"
            :disabled="pagination.page >= pagination.totalPages"
            @click="filters.page = pagination.page + 1"
          >
            Next
          </UButton>
        </div>
      </div>
    </UCard>
  </div>
</template>

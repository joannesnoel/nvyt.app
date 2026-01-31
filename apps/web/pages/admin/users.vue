<script setup lang="ts">
definePageMeta({
  layout: 'default',
  middleware: ['admin'],
})

const route = useRoute()

// Filters
const filters = reactive({
  page: parseInt(route.query.page as string) || 1,
  limit: 20,
  search: (route.query.search as string) || '',
  emailVerified: (route.query.emailVerified as string) || '',
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

// Build query params
const queryParams = computed(() => {
  const params: Record<string, string | number> = {
    page: filters.page,
    limit: filters.limit,
  }
  if (debouncedSearch.value) params.search = debouncedSearch.value
  if (filters.emailVerified) params.emailVerified = filters.emailVerified
  return params
})

// Fetch users
const { data, pending } = await useFetch('/api/v1/admin/users', {
  query: queryParams,
  watch: [queryParams],
})

const users = computed(() => data.value?.data?.users || [])
const stats = computed(() => data.value?.data?.stats || { total: 0, verified: 0, unverified: 0 })
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
    hour: 'numeric',
    minute: '2-digit',
  })
}

const toast = useToast()
const resendingFor = ref<string | null>(null)
const resentFor = ref<Set<string>>(new Set())

async function resendVerification(userId: string) {
  resendingFor.value = userId
  try {
    await $fetch(`/api/v1/admin/users/${userId}/resend-verification`, { method: 'POST' })
    resentFor.value.add(userId)
    toast.add({ title: 'Verification email sent', color: 'green' })
  } catch (e: any) {
    toast.add({ title: e?.data?.message || 'Failed to send email', color: 'red' })
  } finally {
    resendingFor.value = null
  }
}

const emailVerifiedOptions = [
  { label: 'All', value: '' },
  { label: 'Verified', value: 'true' },
  { label: 'Unverified', value: 'false' },
]
</script>

<template>
  <div class="py-8">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          Admin: Users
        </h1>
        <p class="text-gray-600 dark:text-gray-400 mt-1">
          View and manage all registered users
        </p>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <UCard>
          <div>
            <p class="text-xs text-gray-600 font-medium mb-1">Total Users</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.total }}</p>
          </div>
        </UCard>

        <UCard>
          <div>
            <p class="text-xs text-green-600 font-medium mb-1">Verified</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.verified }}</p>
          </div>
        </UCard>

        <UCard>
          <div>
            <p class="text-xs text-yellow-600 font-medium mb-1">Unverified</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.unverified }}</p>
          </div>
        </UCard>
      </div>

      <!-- Filters -->
      <UCard class="mb-6">
        <div class="flex flex-col sm:flex-row gap-4 items-end">
          <UFormGroup label="Search" class="flex-1">
            <UInput
              v-model="filters.search"
              placeholder="Search by name or email..."
              icon="i-heroicons-magnifying-glass"
            />
          </UFormGroup>
          <UFormGroup label="Email Verified">
            <USelectMenu
              v-model="filters.emailVerified"
              :options="emailVerifiedOptions"
              value-attribute="value"
              option-attribute="label"
            />
          </UFormGroup>
        </div>
      </UCard>

      <!-- Users Table -->
      <UCard>
        <div v-if="pending" class="space-y-4">
          <USkeleton v-for="i in 5" :key="i" class="h-16" />
        </div>

        <div v-else-if="users.length === 0" class="text-center py-12">
          <UIcon name="i-heroicons-users" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p class="text-gray-500">No users found</p>
        </div>

        <div v-else class="overflow-x-auto -mx-4 sm:mx-0">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Verified
                </th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Social Login
                </th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Events
                </th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Orders
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Joined
                </th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr v-for="u in users" :key="u.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <UAvatar :src="u.avatarUrl || undefined" :alt="u.name" size="xs" />
                    <span class="text-sm font-medium text-gray-900 dark:text-white">{{ u.name }}</span>
                  </div>
                </td>
                <td class="px-4 py-3 text-sm text-gray-500">
                  {{ u.email }}
                </td>
                <td class="px-4 py-3 text-center">
                  <UBadge :color="u.emailVerified ? 'green' : 'yellow'" variant="soft" size="xs">
                    {{ u.emailVerified ? 'Yes' : 'No' }}
                  </UBadge>
                </td>
                <td class="px-4 py-3 text-center">
                  <div class="flex gap-1 justify-center">
                    <UBadge v-if="u.hasGoogle" color="blue" variant="soft" size="xs">Google</UBadge>
                    <UBadge v-if="u.hasFacebook" color="indigo" variant="soft" size="xs">Facebook</UBadge>
                    <span v-if="!u.hasGoogle && !u.hasFacebook" class="text-xs text-gray-400">-</span>
                  </div>
                </td>
                <td class="px-4 py-3 text-center text-sm text-gray-900 dark:text-white">
                  {{ u.eventCount }}
                </td>
                <td class="px-4 py-3 text-center text-sm text-gray-900 dark:text-white">
                  {{ u.orderCount }}
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                  {{ formatDate(u.createdAt) }}
                </td>
                <td class="px-4 py-3 text-center">
                  <UIcon
                    v-if="resentFor.has(u.id)"
                    name="i-heroicons-check-circle"
                    class="w-5 h-5 text-green-500"
                    title="Verification email sent"
                  />
                  <UButton
                    v-else-if="!u.emailVerified"
                    icon="i-heroicons-envelope"
                    size="xs"
                    color="gray"
                    variant="ghost"
                    title="Resend verification email"
                    :loading="resendingFor === u.id"
                    @click="resendVerification(u.id)"
                  />
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
  </div>
</template>
